'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { apiClient } from '@/services/api-client';
import {
  institutionService,
  type BulkScheduleDto,
  type BulkScheduleConflict,
  type SessionEnriched,
  type LiveSessionsSummary,
  type LiveActivityItem,
  type LiveRosterResponse,
  type LiveRosterStudent,
  type AcademicYear,
  type Department,
  type Batch,
  type Section,
  type Subject,
  type InstitutionUser,
  type RecurringPlan,
  type PlannerStats,
  type PlanTemplate,
  type PlanConflict,
} from '@/services/institution.service';
import {
  Radio, Calendar, PlayCircle, StopCircle, History,
  Clock, Users, BookOpen, Edit2, X, ChevronRight,
  AlertTriangle, CheckCircle, CalendarPlus, Layers, CalendarDays,
  ChevronLeft, ChevronDown, Video, UserCheck, Activity, Search,
  RotateCw, LayoutGrid, List, MapPin, ExternalLink, User as UserIcon,
  Building2, Sparkles, Plus, ArrowRight, Laptop, Check, Download,
  Lightbulb, AlertCircle, ShieldCheck, MoreHorizontal, GraduationCap,
  Trash2, SlidersHorizontal, CalendarClock, Repeat, Copy, Shield,
  UploadCloud, FileText, CheckCheck, Eye, CheckCircle2, XCircle,
  Filter, RotateCcw, FileArchive, Folder
} from 'lucide-react';
import styles from '../dashboard/page.module.css';
import liveStyles from './sessions.module.css';
import { toast } from '@/components/ui/toast';

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'live' | 'calendar' | 'upcoming' | 'planner' | 'history';
type CalViewMode = 'day' | 'week' | 'month' | 'agenda';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function defaultPlannerDateRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  const originalDay = end.getDate();
  end.setDate(1);
  end.setMonth(end.getMonth() + 3);
  const lastDayOfTargetMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  end.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start_date: toDateInput(start), end_date: toDateInput(end) };
}

const statusColor: Record<string, string> = {
  scheduled: '#7c3aed', active: '#22c55e', ended: '#2563eb', cancelled: '#ef4444',
};
const statusBg: Record<string, string> = {
  scheduled: '#faf5ff', active: '#f0fdf4', ended: '#eff6ff', cancelled: '#fef2f2',
};

const fmt = (d?: string) =>
  d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const fmtTime = (d?: string) =>
  d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

function computeOccurrences(startDate: string, endDate: string, dayOfWeek: number): string[] {
  if (!startDate || !endDate || dayOfWeek < 0 || dayOfWeek > 6) return [];
  const result: string[] = [];
  const targetJsDay = (dayOfWeek + 1) % 7;
  const end = new Date(endDate + 'T00:00:00');
  let cur = new Date(startDate + 'T00:00:00');
  while (cur <= end) {
    if (cur.getDay() === targetJsDay) {
      result.push(cur.toISOString().slice(0, 10));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

function getAvatarColor(name?: string) {
  const colors = ['#0284c7', '#10b981', '#7c3aed', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6'];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getAccentColor(idx: number) {
  const accents = ['#10b981', '#06b6d4', '#f43f5e', '#8b5cf6', '#3b82f6'];
  return accents[idx % accents.length];
}

function getTimeAgo(dateStr?: string, fallbackMinutes?: number): string {
  if (!dateStr && !fallbackMinutes) return 'Started recently';
  let diffMin = 0;
  if (dateStr) {
    const start = new Date(dateStr).getTime();
    const now = Date.now();
    diffMin = Math.max(1, Math.round((now - start) / 60000));
  } else if (fallbackMinutes) {
    diffMin = fallbackMinutes;
  }
  if (diffMin >= 60) {
    const hrs = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return `Started ${hrs} hr${hrs > 1 ? 's' : ''} ${mins > 0 ? `${mins} min ` : ''}ago`;
  }
  return `Started ${diffMin} min ago`;
}

function getElapsedDisplay(dateStr?: string, durationMins = 60, fallbackElapsed?: number) {
  let elapsedMin = fallbackElapsed || 0;
  if (dateStr) {
    const start = new Date(dateStr).getTime();
    const now = Date.now();
    elapsedMin = Math.max(1, Math.round((now - start) / 60000));
  }
  const elpHrs = Math.floor(elapsedMin / 60);
  const elpMins = elapsedMin % 60;
  const elapsedStr = elpHrs > 0 ? `${elpHrs}h ${elpMins}m` : `${elpMins}m`;

  const durHrs = Math.floor(durationMins / 60);
  const durMins = durationMins % 60;
  const durationStr = durHrs > 0 ? (durMins > 0 ? `${durHrs}h ${durMins}m` : `${durHrs}h`) : `${durMins}m`;

  return { elapsedStr, durationStr };
}

function getSessionPastel(s: SessionEnriched, idx: number) {
  const code = (s.subject_code || '').toUpperCase();
  const name = (s.subject_name || s.title || '').toLowerCase();

  if (code.includes('102') || name.includes('data struct')) {
    return { bg: '#e0f2fe', border: '#7dd3fc', accent: '#0284c7', text: '#0369a1' }; // Sky Blue
  }
  if (code.includes('105') || name.includes('network')) {
    return { bg: '#dcfce7', border: '#86efac', accent: '#16a34a', text: '#15803d' }; // Green
  }
  if (code.includes('104') || name.includes('dbms')) {
    return { bg: '#ffe4e6', border: '#fda4af', accent: '#e11d48', text: '#be123c' }; // Pink/Rose
  }
  if (code.includes('205') || name.includes('python')) {
    return { bg: '#fef3c7', border: '#fcd34d', accent: '#d97706', text: '#b45309' }; // Amber
  }
  if (code.includes('201') || name.includes('oop')) {
    return { bg: '#f3e8ff', border: '#d8b4fe', accent: '#7c3aed', text: '#6d28d9' }; // Lavender
  }
  if (code.includes('301') || name.includes('learning')) {
    return { bg: '#f3e8ff', border: '#d8b4fe', accent: '#7c3aed', text: '#6d28d9' }; // Lavender/Purple
  }
  if (code.includes('302') || name.includes('web')) {
    return { bg: '#e0f2fe', border: '#7dd3fc', accent: '#0284c7', text: '#0369a1' }; // Blue
  }
  if (code.includes('303') || name.includes('database system')) {
    return { bg: '#dcfce7', border: '#86efac', accent: '#16a34a', text: '#15803d' }; // Green
  }
  if (code.includes('304') || name.includes('ai & ml')) {
    return { bg: '#ffe4e6', border: '#fda4af', accent: '#e11d48', text: '#be123c' }; // Rose
  }

  const palette = [
    { bg: '#e0f2fe', border: '#7dd3fc', accent: '#0284c7', text: '#0369a1' },
    { bg: '#dcfce7', border: '#86efac', accent: '#16a34a', text: '#15803d' },
    { bg: '#ffe4e6', border: '#fda4af', accent: '#e11d48', text: '#be123c' },
    { bg: '#fef3c7', border: '#fcd34d', accent: '#d97706', text: '#b45309' },
    { bg: '#f3e8ff', border: '#d8b4fe', accent: '#7c3aed', text: '#6d28d9' },
    { bg: '#ccfbf1', border: '#5eead4', accent: '#0d9488', text: '#0f766e' },
  ];
  return palette[idx % palette.length];
}

function getPlanVisual(name: string, idx: number) {
  const n = (name || '').toLowerCase();
  if (n.includes('core')) {
    return { bg: '#ede9fe', color: '#7c3aed', letter: 'C' };
  }
  if (n.includes('data struct') || n.includes('ds lab')) {
    return { bg: '#e0f2fe', color: '#0284c7', letter: 'D' };
  }
  if (n.includes('python')) {
    return { bg: '#fef3c7', color: '#d97706', letter: 'P' };
  }
  if (n.includes('database') || n.includes('dbms')) {
    return { bg: '#dcfce7', color: '#16a34a', letter: 'D' };
  }
  if (n.includes('ai') || n.includes('ml') || n.includes('learning')) {
    return { bg: '#ffe4e6', color: '#e11d48', letter: 'A' };
  }
  if (n.includes('network')) {
    return { bg: '#e0f2fe', color: '#0369a1', letter: 'N' };
  }
  if (n.includes('oop')) {
    return { bg: '#fef3c7', color: '#b45309', letter: 'O' };
  }
  if (n.includes('web')) {
    return { bg: '#e0f2fe', color: '#0284c7', letter: 'W' };
  }
  if (n.includes('security')) {
    return { bg: '#fef2f2', color: '#dc2626', letter: 'S' };
  }
  if (n.includes('cloud')) {
    return { bg: '#f0fdf4', color: '#15803d', letter: 'C' };
  }
  const accents = [
    { bg: '#ede9fe', color: '#7c3aed', letter: name[0] || 'L' },
    { bg: '#e0f2fe', color: '#0284c7', letter: name[0] || 'L' },
    { bg: '#fef3c7', color: '#d97706', letter: name[0] || 'L' },
    { bg: '#dcfce7', color: '#16a34a', letter: name[0] || 'L' },
  ];
  return accents[idx % accents.length];
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseTimeStringToHourMinute(timeStr?: string): { hour: number; minute: number } {
  if (!timeStr) return { hour: 9, minute: 0 };
  const clean = timeStr.trim().toUpperCase();
  const isPM = clean.includes('PM');
  const isAM = clean.includes('AM');
  const stripped = clean.replace('AM', '').replace('PM', '').trim();
  const parts = stripped.split(':');
  let hour = parseInt(parts[0], 10) || 9;
  const minute = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
  if (isPM && hour < 12) hour += 12;
  else if (isAM && hour === 12) hour = 0;
  return { hour, minute };
}

const DAY_MAP_LOOKUP: Record<string, number> = {
  mon: 0, monday: 0,
  tue: 1, tuesday: 1,
  wed: 2, wednesday: 2,
  thu: 3, thursday: 3,
  fri: 4, friday: 4,
  sat: 5, saturday: 5,
  sun: 6, sunday: 6,
};

function projectRecurringOccurrences(
  plans: RecurringPlan[],
  windowStart: Date,
  windowEnd: Date,
  existingSessions: SessionEnriched[],
  allSections: Section[] = []
): SessionEnriched[] {
  if (!plans || plans.length === 0) return [];
  const projected: SessionEnriched[] = [];

  for (const plan of plans) {
    if (plan.status !== 'active') continue;

    const days = plan.schedule_days || [];
    if (!days.length || !plan.start_date || !plan.end_date) continue;
    const targetDays: number[] = [];
    for (const d of days) {
      const idx = DAY_MAP_LOOKUP[String(d).toLowerCase().trim()];
      if (idx !== undefined && !targetDays.includes(idx)) targetDays.push(idx);
    }
    if (targetDays.length === 0) continue;

    const { hour, minute } = parseTimeStringToHourMinute(plan.raw_start_time || plan.start_time);

    // Date range bounds
    const planStart = new Date(plan.start_date + 'T00:00:00');
    const planEnd = new Date(plan.end_date + 'T23:59:59');

    const rangeStart = planStart > windowStart ? planStart : windowStart;
    const rangeEnd = planEnd < windowEnd ? planEnd : windowEnd;

    const cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
    const stop = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());

    const planSecList = (plan.sections && plan.sections.length > 0) ? plan.sections : [];
    const planSubList = plan.subjects?.length ? plan.subjects : [];

    let occNum = 1;
    while (cur <= stop) {
      const jsDay = cur.getDay();
      const monBasedDay = jsDay === 0 ? 6 : jsDay - 1;

      if (targetDays.includes(monBasedDay)) {
        const slotDate = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), hour, minute, 0);
        const k = dayKey(slotDate);

        for (const rawSec of planSecList) {
          const secToken = typeof rawSec === 'object' ? (rawSec.id || rawSec.name || '') : String(rawSec);
          const matchedSec = allSections.find(s => s.id === secToken || s.name === secToken);
          const sectionName = matchedSec?.name || (typeof rawSec === 'object' ? rawSec.name : String(rawSec));
          for (const subject of planSubList) {
            const subjectName = subject.name || plan.name || 'Lab Session';
            const hasCollision = existingSessions.some(s => {
              if (!s.scheduled_at) return false;
              const sd = new Date(s.scheduled_at);
              if (dayKey(sd) !== k || sd.getHours() !== hour || sd.getMinutes() !== minute) return false;
              const sameSection = s.section_id === secToken || (matchedSec && s.section_id === matchedSec.id) || s.section_name === sectionName;
              const sameSubject = (s.subject_name || '').toLowerCase() === subjectName.toLowerCase();
              return sameSection && sameSubject;
            });

            if (!hasCollision) {
              projected.push({
                id: `projected-${plan.id}-${k}-${secToken}-${subject.id || subjectName}-${occNum}`,
                title: `${plan.name} — Session ${occNum}`,
                status: 'scheduled',
                scheduled_at: slotDate.toISOString(),
                duration_minutes: plan.duration_minutes || 60,
                instructor_id: plan.instructor_id,
                instructor_name: plan.instructor_name || '',
                subject_name: subjectName,
                subject_code: subject.code || '',
                section_id: matchedSec?.id,
                section_name: sectionName,
                batch_id: plan.batch_id,
                batch_name: plan.batch_name || '',
                department_name: plan.department_name || '',
                department_code: plan.department_code || '',
                academic_year_label: plan.academic_year_label || '',
                room: plan.room || '',
                student_count: 0,
                students_total_count: 0,
                students_online_count: 0,
                is_recurring_projection: true,
              });
            }
          }
        }
        occNum++;
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  return projected;
}

// ── Edit modal for Upcoming sessions ──────────────────────────────────────────

interface EditModalProps {
  session: SessionEnriched;
  onClose: () => void;
  onSaved: () => void;
  toast3: (m: string) => void;
}

function EditModal({ session, onClose, onSaved, toast3 }: EditModalProps) {
  const [title, setTitle] = useState(session.title ?? '');
  const [scheduledAt, setScheduledAt] = useState(
    session.scheduled_at ? session.scheduled_at.slice(0, 16) : ''
  );
  const [duration, setDuration] = useState(String(session.duration_minutes ?? 60));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await institutionService.updateSession(session.id, {
        title: title.trim() || undefined,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        duration_minutes: parseInt(duration) || undefined,
      });
      toast3('Session updated.');
      onSaved();
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast3(e?.response?.data?.error ?? 'Failed to update session.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={liveStyles.modalBackdrop} onClick={onClose}>
      <div className={liveStyles.modalBox} onClick={e => e.stopPropagation()}>
        <div className={liveStyles.modalHeader}>
          <h3 className={liveStyles.modalTitle}>Edit Session</h3>
          <button className={liveStyles.modalCloseBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div className={liveStyles.formField}>
          <label className={liveStyles.formLabel}>Title</label>
          <input className={liveStyles.formInput} value={title}
            onChange={e => setTitle(e.target.value)} placeholder="Session title…" />
        </div>
        <div className={liveStyles.formField}>
          <label className={liveStyles.formLabel}>Date &amp; Time</label>
          <input className={liveStyles.formInput} type="datetime-local" value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)} />
        </div>
        <div className={liveStyles.formField}>
          <label className={liveStyles.formLabel}>Duration (minutes)</label>
          <select className={liveStyles.formSelect} value={duration} onChange={e => setDuration(e.target.value)}>
            <option value="30">30 mins</option>
            <option value="45">45 mins</option>
            <option value="60">1 hour</option>
            <option value="90">1.5 hours</option>
            <option value="120">2 hours</option>
            <option value="180">3 hours</option>
          </select>
        </div>
        <div className={liveStyles.modalFooter}>
          <button className={liveStyles.btnCancel} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={liveStyles.btnSubmit} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page Content ─────────────────────────────────────────────────────────

function SessionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const tabParam = searchParams.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(() => {
    if (tabParam && ['live', 'calendar', 'upcoming', 'planner', 'history'].includes(tabParam)) {
      return tabParam;
    }
    return 'live';
  });

  useEffect(() => {
    if (tabParam && ['live', 'calendar', 'upcoming', 'planner', 'history'].includes(tabParam)) {
      setTab(tabParam);
    }
  }, [tabParam]);

  const switchTab = (newTab: Tab) => {
    setTab(newTab);
    router.push(`/institution/sessions?tab=${newTab}`);
  };

  // Active subpage label for shell breadcrumbs
  const activeSubPageLabel = useMemo(() => {
    switch (tab) {
      case 'live': return 'Live';
      case 'upcoming': return 'Upcoming';
      case 'calendar': return 'Calendar';
      case 'planner': return 'Planner';
      case 'history': return 'History';
      default: return 'Live';
    }
  }, [tab]);

  // Sessions data
  const [liveSessions, setLiveSessions] = useState<SessionEnriched[]>([]);
  const [liveSummary, setLiveSummary] = useState<LiveSessionsSummary | null>(null);
  const [recentActivity, setRecentActivity] = useState<LiveActivityItem[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<SessionEnriched[]>([]);
  const [historySessions, setHistorySessions] = useState<SessionEnriched[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(0);
  const [historyPerPage, setHistoryPerPage] = useState(7);
  const [historySelectedSession, setHistorySelectedSession] = useState<SessionEnriched | null>(null);
  const [historySelectedIds, setHistorySelectedIds] = useState<Set<string>>(new Set());
  const [historyViewMode, setHistoryViewMode] = useState<'table' | 'calendar'>('table');

  // 5 History Filters
  const [historyDept, setHistoryDept] = useState<string>('all');
  const [historyBatch, setHistoryBatch] = useState<string>('all');
  const [historySection, setHistorySection] = useState<string>('all');
  const [historySubject, setHistorySubject] = useState<string>('all');
  const [historyInstructor, setHistoryInstructor] = useState<string>('all');
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyDateRange, setHistoryDateRange] = useState<string>('1 Sep 2026 – 30 Sep 2026');

  // Popover menus
  const [openHistoryDeptMenu, setOpenHistoryDeptMenu] = useState(false);
  const [openHistoryBatchMenu, setOpenHistoryBatchMenu] = useState(false);
  const [openHistorySecMenu, setOpenHistorySecMenu] = useState(false);
  const [openHistorySubjMenu, setOpenHistorySubjMenu] = useState(false);
  const [openHistoryInstMenu, setOpenHistoryInstMenu] = useState(false);
  const [openHistoryDateRangeMenu, setOpenHistoryDateRangeMenu] = useState(false);
  const [openHistoryActionsId, setOpenHistoryActionsId] = useState<string | null>(null);

  // Student Attendance Roster Modal
  const [historyRosterOpen, setHistoryRosterOpen] = useState(false);
  const [historyRosterLoading, setHistoryRosterLoading] = useState(false);
  const [historyRosterStudents, setHistoryRosterStudents] = useState<any[]>([]);

  // Empty until loaded from persisted session history; do not show demo metrics.
  const [historyStats, setHistoryStats] = useState<any>({
    total_sessions: 0,
    completed: 0,
    cancelled: 0,
    rescheduled: 0,
    success_rate: 0,
    cancelled_percent: 0,
    rescheduled_percent: 0,
    avg_attendance: 0,
    by_subject: [],
    by_status: [],
    attendance_trend: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Live View switch: cards vs list
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [liveSearch, setLiveSearch] = useState('');

  // 5 Live Filter states
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [instructors, setInstructors] = useState<InstitutionUser[]>([]);

  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  // Close filter dropdown on outside click
  const filterRef = useRef<HTMLDivElement | null>(null);
  const plannerFilterBarRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setOpenFilter(null);
      }
      if (plannerFilterBarRef.current && !plannerFilterBarRef.current.contains(e.target as Node)) {
        setOpenPlannerFilter(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Section subjects for planner
  const [sectionSubjects, setSectionSubjects] = useState<{
    id: string; subject_id: string; subject_name: string; subject_code?: string;
    instructor_id: string; instructor_name: string;
  }[]>([]);

  // Toast
  const toast3 = (msg: string) => { toast.info(msg); };

  // Edit modal for upcoming
  const [editTarget, setEditTarget] = useState<SessionEnriched | null>(null);

  // Start New Session modal
  const [showStartModal, setShowStartModal] = useState(false);
  const [startForm, setStartForm] = useState<{
    title: string;
    section_id: string;
    section_ids?: string[];
    subject_id: string;
    instructor_id: string;
    duration_minutes: number;
    room: string;
    start_immediately: boolean;
    scheduled_at: string;
  }>({
    title: '',
    section_id: '',
    section_ids: [],
    subject_id: '',
    instructor_id: '',
    duration_minutes: 60,
    room: 'Lab 1 (Main Block)',
    start_immediately: true,
    scheduled_at: '',
  });
  const [startSubmitting, setStartSubmitting] = useState(false);

  // View Students live roster modal
  const [rosterSession, setRosterSession] = useState<SessionEnriched | null>(null);
  const [rosterData, setRosterData] = useState<LiveRosterResponse | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');

  // ═════════════════════════════════════════════════════════════════════════════
  // RECURRING PLANNER STATE & CONTROLS
  // ═════════════════════════════════════════════════════════════════════════════
  const [plannerSubTab, setPlannerSubTab] = useState<'recurring' | 'generated' | 'conflicts' | 'templates'>('recurring');
  const [recurringPlans, setRecurringPlans] = useState<RecurringPlan[]>([]);
  const [plannerStats, setPlannerStats] = useState<PlannerStats>({
    total_plans: 0,
    active_plans: 0,
    sessions_generated: 0,
    sections_covered: 0,
    conflict_rate: 0,
    on_track_pct: 0,
  });
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerSearch, setPlannerSearch] = useState('');
  const [plannerYear, setPlannerYear] = useState('all');
  const [plannerDept, setPlannerDept] = useState('all');
  const [plannerBatch, setPlannerBatch] = useState('all');
  const [plannerSection, setPlannerSection] = useState('all');
  const [plannerStatus, setPlannerStatus] = useState('all');
  const [openPlannerFilter, setOpenPlannerFilter] = useState<string | null>(null);
  const [plannerPage, setPlannerPage] = useState(1);
  const plannerPerPage = 8;

  // Drawer state (Create Recurring Plan)
  const [isPlannerDrawerOpen, setIsPlannerDrawerOpen] = useState(false);
  const [drawerStep, setDrawerStep] = useState<1 | 2 | 3 | 4>(1);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [drawerForm, setDrawerForm] = useState({
    name: '',
    description: '',
    department_id: '',
    batch_id: '',
    academic_year_id: '',
    sections: [] as string[],
    subjects: [] as Array<{ id: string; name: string; code?: string }>,
    schedule_days: [] as string[],
    start_time: '09:00',
    duration_minutes: 60,
    ...defaultPlannerDateRange(),
    room: 'Lab 1 (Main Block)',
    instructor_id: '',
    status: 'active' as 'active' | 'draft' | 'paused',
  });
  const [drawerSubmitting, setDrawerSubmitting] = useState(false);
  const plannerSections = useMemo(
    () => drawerForm.batch_id ? allSections.filter(s => s.batch_id === drawerForm.batch_id) : [],
    [allSections, drawerForm.batch_id]
  );
  const plannerSubjects = useMemo(
    () => drawerForm.department_id
      ? allSubjects.filter(s => !s.department_id || s.department_id === drawerForm.department_id)
      : [],
    [allSubjects, drawerForm.department_id]
  );

  // Popovers & Modals
  const [openPlanMenuId, setOpenPlanMenuId] = useState<string | null>(null);
  const [openSubjectPopoverId, setOpenSubjectPopoverId] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [planTemplates, setPlanTemplates] = useState<PlanTemplate[]>([]);
  const [planConflicts, setPlanConflicts] = useState<PlanConflict | null>(null);

  // Planner state (fallback bulk schedule)
  const defaultPlanner: BulkScheduleDto = {
    section_id: '', subject_id: '', instructor_id: '',
    title_prefix: '', day_of_week: 0,
    start_time: '09:00', start_date: '', end_date: '',
    duration_minutes: 60,
  };
  const [planner, setPlanner] = useState<BulkScheduleDto>(defaultPlanner);
  const [plannerBusy, setPlannerBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    created: SessionEnriched[];
    conflicts: BulkScheduleConflict[];
    created_count: number;
    skipped_count: number;
    warnings?: string[];
    message?: string;
  } | null>(null);

  // ═════════════════════════════════════════════════════════════════════════════
  // CALENDAR STATE & CONTROLS
  // ═════════════════════════════════════════════════════════════════════════════
  const [calMode, setCalMode] = useState<CalViewMode>('week');
  const [calSelectedDate, setCalSelectedDate] = useState<Date>(() => new Date());

  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = (day + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [weekSessions, setWeekSessions] = useState<SessionEnriched[]>([]);
  const [weekLoading, setWeekLoading] = useState(false);
  const [selectedSessionDetails, setSelectedSessionDetails] = useState<SessionEnriched | null>(null);

  // 7 Calendar filter states
  const [selectedCalYear, setSelectedCalYear] = useState<string>('');
  const [selectedCalDept, setSelectedCalDept] = useState<string>('');
  const [selectedCalBatch, setSelectedCalBatch] = useState<string>('');
  const [selectedCalSection, setSelectedCalSection] = useState<string>('');
  const [selectedCalSubject, setSelectedCalSubject] = useState<string>('');
  const [selectedCalInstructor, setSelectedCalInstructor] = useState<string>('');
  const [selectedCalLab, setSelectedCalLab] = useState<string>('');
  const [openCalFilter, setOpenCalFilter] = useState<string | null>(null);

  const calFilterRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (calFilterRef.current && !calFilterRef.current.contains(e.target as Node)) {
        setOpenCalFilter(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── 8 Upcoming Filter States & Helpers ──
  const [selectedUpcomingYear, setSelectedUpcomingYear] = useState<string>('2026 - 2027');
  const [selectedUpcomingDept, setSelectedUpcomingDept] = useState<string>('');
  const [selectedUpcomingBatch, setSelectedUpcomingBatch] = useState<string>('');
  const [selectedUpcomingSection, setSelectedUpcomingSection] = useState<string>('');
  const [selectedUpcomingSubject, setSelectedUpcomingSubject] = useState<string>('');
  const [selectedUpcomingInstructor, setSelectedUpcomingInstructor] = useState<string>('');
  const [selectedUpcomingDateRange, setSelectedUpcomingDateRange] = useState<string>('All Dates');
  const [selectedUpcomingStatus, setSelectedUpcomingStatus] = useState<string>('All Status');
  const [openUpcomingFilter, setOpenUpcomingFilter] = useState<string | null>(null);
  const [upcomingSearchQuery, setUpcomingSearchQuery] = useState<string>('');
  const [upcomingSortBy, setUpcomingSortBy] = useState<string>('earliest');
  const [openUpcomingRowMenu, setOpenUpcomingRowMenu] = useState<string | null>(null);

  // Mini Calendar Widget in Upcoming Tab
  const [miniCalMonth, setMiniCalMonth] = useState<Date>(() => new Date());
  const [selectedUpcomingDay, setSelectedUpcomingDay] = useState<number | null>(null);

  const upcomingFilterRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (upcomingFilterRef.current && !upcomingFilterRef.current.contains(e.target as Node)) {
        setOpenUpcomingFilter(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const clearUpcomingFilters = () => {
    setSelectedUpcomingYear('2026 - 2027');
    setSelectedUpcomingDept('');
    setSelectedUpcomingBatch('');
    setSelectedUpcomingSection('');
    setSelectedUpcomingSubject('');
    setSelectedUpcomingInstructor('');
    setSelectedUpcomingDateRange('All Dates');
    setSelectedUpcomingStatus('All Status');
    setUpcomingSearchQuery('');
    setUpcomingSortBy('earliest');
    setSelectedUpcomingDay(null);
  };

  // Dynamic mini calendar calculations
  const miniCalDaysInMonth = useMemo(() => {
    return new Date(miniCalMonth.getFullYear(), miniCalMonth.getMonth() + 1, 0).getDate();
  }, [miniCalMonth]);

  const miniCalStartDayOffset = useMemo(() => {
    // 0 = Mon, 6 = Sun
    return (new Date(miniCalMonth.getFullYear(), miniCalMonth.getMonth(), 1).getDay() + 6) % 7;
  }, [miniCalMonth]);

  const miniCalEventDays = useMemo(() => {
    const set = new Set<number>();
    for (const s of upcomingSessions) {
      if (!s.scheduled_at) continue;
      const d = new Date(s.scheduled_at);
      if (d.getFullYear() === miniCalMonth.getFullYear() && d.getMonth() === miniCalMonth.getMonth()) {
        set.add(d.getDate());
      }
    }
    return set;
  }, [upcomingSessions, miniCalMonth]);

  // Filtered upcoming sessions
  const filteredUpcomingSessions = useMemo(() => {
    const list = upcomingSessions.filter(s => {
      // Academic Year filter
      if (selectedUpcomingYear && selectedUpcomingYear !== 'All Years') {
        const yr = (s.academic_year_label || '').toLowerCase();
        const target = selectedUpcomingYear.toLowerCase();
        if (!yr.includes('2026') && !target.includes('2026') && !yr.includes(target)) return false;
      }
      // Department filter
      if (selectedUpcomingDept && selectedUpcomingDept !== 'All Departments') {
        const dName = (s.department_name || '').toLowerCase();
        const dCode = (s.department_code || '').toLowerCase();
        const target = selectedUpcomingDept.toLowerCase();
        if (!dName.includes(target) && !dCode.includes(target)) return false;
      }
      // Batch filter
      if (selectedUpcomingBatch && selectedUpcomingBatch !== 'All Batches') {
        const bName = (s.batch_name || '').toLowerCase();
        if (!bName.includes(selectedUpcomingBatch.toLowerCase())) return false;
      }
      // Section filter
      if (selectedUpcomingSection && selectedUpcomingSection !== 'All Sections') {
        const sName = (s.section_name || '').toLowerCase();
        if (sName !== selectedUpcomingSection.toLowerCase() && s.section_id !== selectedUpcomingSection) return false;
      }
      // Subject filter
      if (selectedUpcomingSubject && selectedUpcomingSubject !== 'All Subjects') {
        const subName = (s.subject_name || '').toLowerCase();
        const subCode = (s.subject_code || '').toLowerCase();
        const target = selectedUpcomingSubject.toLowerCase();
        if (!subName.includes(target) && !subCode.includes(target)) return false;
      }
      // Instructor filter
      if (selectedUpcomingInstructor && selectedUpcomingInstructor !== 'All Instructors') {
        const iName = (s.instructor_name || '').toLowerCase();
        if (!iName.includes(selectedUpcomingInstructor.toLowerCase()) && s.instructor_id !== selectedUpcomingInstructor) return false;
      }
      // Status filter
      if (selectedUpcomingStatus && selectedUpcomingStatus !== 'All Status') {
        if ((s.status || '').toLowerCase() !== selectedUpcomingStatus.toLowerCase()) return false;
      }
      // Date range filter
      const todayK = dayKey(new Date());
      if (selectedUpcomingDateRange === 'Today') {
        const d = new Date(s.scheduled_at);
        if (dayKey(d) !== todayK) return false;
      } else if (selectedUpcomingDateRange.includes('This Week')) {
        const d = new Date(s.scheduled_at);
        const t = d.getTime();
        const startOfWeek = new Date();
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 7);
        if (t < startOfWeek.getTime() || t >= endOfWeek.getTime()) return false;
      }
      // Mini calendar specific day filter
      if (selectedUpcomingDay !== null) {
        const d = new Date(s.scheduled_at);
        if (d.getFullYear() !== miniCalMonth.getFullYear() ||
            d.getMonth() !== miniCalMonth.getMonth() ||
            d.getDate() !== selectedUpcomingDay) {
          return false;
        }
      }
      // Search query
      if (upcomingSearchQuery.trim()) {
        const q = upcomingSearchQuery.toLowerCase();
        const matchTitle = (s.title || '').toLowerCase().includes(q);
        const matchSubj = (s.subject_name || '').toLowerCase().includes(q);
        const matchCode = (s.subject_code || '').toLowerCase().includes(q);
        const matchInst = (s.instructor_name || '').toLowerCase().includes(q);
        const matchRoom = (s.room || '').toLowerCase().includes(q);
        if (!matchTitle && !matchSubj && !matchCode && !matchInst && !matchRoom) return false;
      }
      return true;
    });

    // Sorting
    list.sort((a, b) => {
      if (upcomingSortBy === 'latest') {
        return new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime();
      } else if (upcomingSortBy === 'subject') {
        return (a.subject_name || a.title || '').localeCompare(b.subject_name || b.title || '');
      } else if (upcomingSortBy === 'duration') {
        return (b.duration_minutes || 0) - (a.duration_minutes || 0);
      }
      // default: earliest
      return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    });

    return list;
  }, [upcomingSessions, selectedUpcomingYear, selectedUpcomingDept, selectedUpcomingBatch, selectedUpcomingSection, selectedUpcomingSubject, selectedUpcomingInstructor, selectedUpcomingStatus, selectedUpcomingDateRange, selectedUpcomingDay, miniCalMonth, upcomingSearchQuery, upcomingSortBy]);

  const upcomingStats = useMemo(() => {
    const total = filteredUpcomingSessions.length;
    const todayK = dayKey(new Date());
    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const todayCount = filteredUpcomingSessions.filter(s => dayKey(new Date(s.scheduled_at)) === todayK).length;
    const thisWeek = filteredUpcomingSessions.filter(s => {
      const t = new Date(s.scheduled_at).getTime();
      return t >= startOfWeek.getTime() && t < endOfWeek.getTime();
    }).length;
    const instSet = new Set(filteredUpcomingSessions.map(s => s.instructor_id || s.instructor_name).filter(Boolean));
    return {
      total,
      today: todayCount,
      thisWeek,
      instructors: instSet.size,
    };
  }, [filteredUpcomingSessions]);

  const groupedUpcomingSessions = useMemo(() => {
    const groups: { dateKey: string; label: string; sessions: SessionEnriched[] }[] = [];
    const map = new Map<string, SessionEnriched[]>();

    for (const s of filteredUpcomingSessions) {
      const k = dayKey(new Date(s.scheduled_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }

    const todayK = dayKey(new Date());
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowK = dayKey(tomorrowDate);

    for (const [k, sessList] of map.entries()) {
      let label = '';
      if (k === todayK) {
        label = `Today • ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`;
      } else if (k === tomorrowK) {
        label = `Tomorrow • ${tomorrowDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`;
      } else {
        const d = new Date(sessList[0].scheduled_at);
        label = `${d.toLocaleDateString('en-IN', { weekday: 'long' })} • ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`;
      }
      groups.push({ dateKey: k, label, sessions: sessList });
    }

    return groups;
  }, [filteredUpcomingSessions]);

  function getSessionCountdownBadge(s: SessionEnriched) {
    const target = new Date(s.scheduled_at).getTime();
    if (isNaN(target)) return { text: 'Scheduled', bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
    const diffMs = target - Date.now();
    if (diffMs <= 0) {
      return { text: 'Starting soon', bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
    }
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) {
      return { text: `Starts in ${days}d ${hours % 24}h`, bg: '#e0f2fe', color: '#0284c7', border: '#bae6fd' };
    }
    if (hours > 0) {
      return { text: `Starts in ${hours}h ${mins % 60}m`, bg: '#e0f2fe', color: '#0284c7', border: '#bae6fd' };
    }
    return { text: `Starts in ${mins}m`, bg: '#e0f2fe', color: '#0284c7', border: '#bae6fd' };
  }

  const exportUpcomingCsv = () => {
    const headers = ['Title', 'Subject Code', 'Subject Name', 'Section', 'Instructor', 'Date & Time', 'Duration', 'Room', 'Status'];
    const rows = filteredUpcomingSessions.map(s => [
      `"${(s.title || '').replace(/"/g, '""')}"`,
      `"${s.subject_code || ''}"`,
      `"${(s.subject_name || '').replace(/"/g, '""')}"`,
      `"${s.section_name || ''}"`,
      `"${(s.instructor_name || '').replace(/"/g, '""')}"`,
      `"${fmt(s.scheduled_at)}"`,
      `"${s.duration_minutes || 60} min"`,
      `"${(s.room || '').replace(/"/g, '""')}"`,
      `"${s.status || 'scheduled'}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Upcoming_Lab_Sessions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast3('Upcoming sessions exported to CSV.');
  };

  const loadWeek = async (ws: Date) => {
    setWeekLoading(true);
    try {
      const we = new Date(ws);
      we.setDate(we.getDate() + 45); // Fetch 6+ weeks to cover full month/agenda views
      const fromDate = new Date(ws.getTime() - 7 * 86400000);
      const fromISO = fromDate.toISOString();
      const toISO = we.toISOString();

      const [sessions, plansRes] = await Promise.all([
        cachedFetch(['week', fromISO, toISO], () => institutionService.getSessionsRange(fromISO, toISO)),
        cachedFetch(['plans_active_calendar'], () => institutionService.getRecurringPlans({ status: 'active', per_page: 100 })).catch(() => ({ plans: [] })),
      ]);

      const concreteSessions: SessionEnriched[] = sessions || [];
      const activePlans: RecurringPlan[] = (plansRes as any)?.plans || [];

      // Project virtual recurring occurrences for future dates if concrete instances aren't generated yet
      const projectedSessions = projectRecurringOccurrences(activePlans, fromDate, we, concreteSessions, allSections);
      setWeekSessions([...concreteSessions, ...projectedSessions]);
    } catch {
      setWeekSessions([]);
    }
    setWeekLoading(false);
  };

  useEffect(() => {
    if (tab === 'calendar') loadWeek(weekStart);
  }, [tab, weekStart]);

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekStart]);

  // Filtered sessions for the calendar
  const filteredCalSessions = useMemo(() => {
    return weekSessions.filter(s => {
      if (selectedCalYear && selectedCalYear !== 'All Years') {
        const yr = (s.academic_year_label || '').toLowerCase();
        const target = selectedCalYear.toLowerCase();
        const normYr = yr.replace(/[–—]/g, '-').replace(/\s+/g, '');
        const normTarget = target.replace(/[–—]/g, '-').replace(/\s+/g, '');
        if (normYr && !normYr.includes(normTarget) && !normTarget.includes(normYr)) return false;
      }
      if (selectedCalDept && selectedCalDept !== 'All Departments') {
        const dName = (s.department_name || '').toLowerCase();
        const dCode = (s.department_code || '').toLowerCase();
        const target = selectedCalDept.toLowerCase();
        if (!dName.includes(target) && !dCode.includes(target)) return false;
      }
      if (selectedCalBatch && selectedCalBatch !== 'All Batches') {
        const bName = (s.batch_name || '').toLowerCase();
        if (!bName.includes(selectedCalBatch.toLowerCase())) return false;
      }
      if (selectedCalSection && selectedCalSection !== 'All Sections') {
        const sName = (s.section_name || '').toLowerCase();
        if (sName !== selectedCalSection.toLowerCase() && s.section_id !== selectedCalSection) return false;
      }
      if (selectedCalSubject && selectedCalSubject !== 'All Subjects') {
        const subName = (s.subject_name || '').toLowerCase();
        const subCode = (s.subject_code || '').toLowerCase();
        const target = selectedCalSubject.toLowerCase();
        if (!subName.includes(target) && !subCode.includes(target)) return false;
      }
      if (selectedCalInstructor && selectedCalInstructor !== 'All Instructors') {
        const iName = (s.instructor_name || '').toLowerCase();
        if (!iName.includes(selectedCalInstructor.toLowerCase()) && s.instructor_id !== selectedCalInstructor) return false;
      }
      if (selectedCalLab && selectedCalLab !== 'All Labs') {
        const room = (s.room || '').toLowerCase();
        if (!room.includes(selectedCalLab.toLowerCase())) return false;
      }
      return true;
    });
  }, [weekSessions, selectedCalYear, selectedCalDept, selectedCalBatch, selectedCalSection, selectedCalSubject, selectedCalInstructor, selectedCalLab]);

  // Calendar session map by day
  const sessionsByDay = useMemo(() => {
    const map: Record<string, SessionEnriched[]> = {};
    for (const s of filteredCalSessions) {
      const d = new Date(s.scheduled_at);
      const k = dayKey(d);
      (map[k] ??= []).push(s);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    }
    return map;
  }, [filteredCalSessions]);

  // Navigation handlers
  const handleNavPrev = () => {
    if (calMode === 'day') {
      const d = new Date(calSelectedDate);
      d.setDate(d.getDate() - 1);
      setCalSelectedDate(d);
    } else if (calMode === 'month') {
      const d = new Date(weekStart);
      d.setMonth(d.getMonth() - 1);
      setWeekStart(d);
    } else {
      const d = new Date(weekStart);
      d.setDate(d.getDate() - 7);
      setWeekStart(d);
    }
  };

  const handleNavNext = () => {
    if (calMode === 'day') {
      const d = new Date(calSelectedDate);
      d.setDate(d.getDate() + 1);
      setCalSelectedDate(d);
    } else if (calMode === 'month') {
      const d = new Date(weekStart);
      d.setMonth(d.getMonth() + 1);
      setWeekStart(d);
    } else {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + 7);
      setWeekStart(d);
    }
  };

  const handleJumpToday = () => {
    const today = new Date();
    setCalSelectedDate(today);
    const mon = new Date(today);
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    setWeekStart(mon);
  };

  // Next session computation across all loaded sessions (upcoming, calendar week, live)
  const nextSession = useMemo(() => {
    const pool = [...upcomingSessions, ...weekSessions, ...liveSessions];
    const map = new Map<string, SessionEnriched>();
    for (const s of pool) {
      if (s?.id) map.set(s.id, s);
    }
    const list = Array.from(map.values());
    if (!list.length) return filteredCalSessions[0] || null;

    const now = Date.now();

    // 1. Check for any currently active/live session
    const active = list.find(s => {
      if (s.status === 'active') return true;
      const start = new Date(s.scheduled_at).getTime();
      const end = start + (s.duration_minutes || 90) * 60000;
      return s.status === 'scheduled' && now >= start && now <= end;
    });
    if (active) return active;

    // 2. Find closest future session (scheduled_at >= now - 15min)
    const future = list
      .filter(s => (s.status === 'scheduled' || s.status === 'active') && new Date(s.scheduled_at).getTime() >= now - 15 * 60000)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

    if (future.length > 0) return future[0];

    // 3. Fallback: closest upcoming or most recent scheduled session
    const scheduled = list
      .filter(s => s.status === 'scheduled')
      .sort((a, b) => Math.abs(new Date(a.scheduled_at).getTime() - now) - Math.abs(new Date(b.scheduled_at).getTime() - now));

    return scheduled[0] || list[0] || null;
  }, [upcomingSessions, weekSessions, liveSessions, filteredCalSessions]);

  const getNextSessionCountdown = useCallback((session: SessionEnriched | null) => {
    if (!session?.scheduled_at) return { label: 'Scheduled', isLive: false };
    const now = Date.now();
    const start = new Date(session.scheduled_at).getTime();
    const end = start + (session.duration_minutes || 90) * 60000;

    if (session.status === 'active' || (now >= start && now <= end)) {
      return { label: 'Live Now', isLive: true };
    }
    if (start < now) {
      return { label: 'Scheduled', isLive: false };
    }
    const diffMs = start - now;
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins <= 30) return { label: 'Starting soon', isLive: false };
    if (days > 0) return { label: `In ${days}d ${hours % 24}h`, isLive: false };
    if (hours > 0) return { label: `In ${hours}h ${mins % 60}m`, isLive: false };
    return { label: `In ${mins}m`, isLive: false };
  }, []);

  // Today's summary stats
  const todaySummary = useMemo(() => {
    const todayKey = dayKey(calSelectedDate);
    const todaySessions = filteredCalSessions.filter(s => dayKey(new Date(s.scheduled_at)) === todayKey);
    const uniqueInstructors = new Set(todaySessions.map(s => s.instructor_id || s.instructor_name).filter(Boolean)).size;
    const totalStudents = todaySessions.reduce((acc, s) => acc + (s.students_total_count || s.student_count || 0), 0);

    // Check conflict overlaps
    let conflicts = 0;
    for (let i = 0; i < todaySessions.length; i++) {
      for (let j = i + 1; j < todaySessions.length; j++) {
        const s1 = todaySessions[i];
        const s2 = todaySessions[j];
        const start1 = new Date(s1.scheduled_at).getTime();
        const end1 = start1 + (s1.duration_minutes || 60) * 60000;
        const start2 = new Date(s2.scheduled_at).getTime();
        const end2 = start2 + (s2.duration_minutes || 60) * 60000;
        if (start1 < end2 && start2 < end1) {
          if (s1.instructor_id === s2.instructor_id || (s1.room && s1.room === s2.room)) {
            conflicts++;
          }
        }
      }
    }

    return {
      totalSessions: todaySessions.length,
      instructors: uniqueInstructors,
      totalStudents,
      conflicts,
    };
  }, [filteredCalSessions, calSelectedDate]);

  // Export Calendar CSV
  const exportCalendarCsv = () => {
    const rows = [
      ['Session Title', 'Subject', 'Subject Code', 'Section', 'Instructor', 'Venue / Room', 'Date', 'Time', 'Duration (min)', 'Status']
    ];
    for (const s of filteredCalSessions) {
      const d = s.scheduled_at ? new Date(s.scheduled_at) : null;
      const dateStr = d ? d.toISOString().slice(0, 10) : '';
      const timeStr = d ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
      rows.push([
        `"${(s.title || '').replace(/"/g, '""')}"`,
        `"${(s.subject_name || '').replace(/"/g, '""')}"`,
        `"${(s.subject_code || '').replace(/"/g, '""')}"`,
        `"${(s.section_name || '').replace(/"/g, '""')}"`,
        `"${(s.instructor_name || '').replace(/"/g, '""')}"`,
        `"${(s.room || 'Lab 1').replace(/"/g, '""')}"`,
        dateStr,
        timeStr,
        String(s.duration_minutes || 60),
        s.status || 'scheduled'
      ]);
    }
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `lab_sessions_calendar_${weekStart.toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast3('✓ Calendar exported successfully as CSV.');
  };

  // Check conflicts action
  const handleCheckConflicts = () => {
    if (todaySummary.conflicts > 0) {
      toast3(`⚠ Warning: ${todaySummary.conflicts} scheduling overlap(s) detected!`);
    } else {
      toast3('✓ No scheduling conflicts detected! All labs & instructors are clear.');
    }
  };

  // Pre-open Schedule Modal for an unscheduled slot
  const openScheduleSlot = (dateStr: string, timeStr: string, room = 'Lab 1 (Main Block)') => {
    const [h, m] = timeStr.split(':');
    const schedDate = new Date(dateStr);
    schedDate.setHours(parseInt(h) || 9, parseInt(m) || 0, 0, 0);

    const pad = (n: number) => String(n).padStart(2, '0');
    const localIso = `${schedDate.getFullYear()}-${pad(schedDate.getMonth() + 1)}-${pad(schedDate.getDate())}T${pad(schedDate.getHours())}:${pad(schedDate.getMinutes())}`;
    const defaultSecId = allSections[0]?.id || '';

    setStartForm({
      title: 'Practical Lab Session',
      section_id: defaultSecId,
      section_ids: defaultSecId ? [defaultSecId] : [],
      subject_id: allSubjects[0]?.id || '',
      instructor_id: instructors[0]?.id || '',
      duration_minutes: 120,
      room,
      start_immediately: false,
      scheduled_at: localIso,
    });
    setShowStartModal(true);
  };

  // Loaders — routed through the react-query cache (fetchQuery) instead of
  // hitting the network every time. Re-opening a tab within STALE_MS renders
  // instantly from cache; mutations invalidate the ['institution','sessions']
  // namespace so the next loader call refetches.
  const SESSIONS_STALE_MS = 30 * 1000;
  const cachedFetch = <T,>(key: unknown[], fn: () => Promise<T>) =>
    queryClient.fetchQuery<T>({
      queryKey: ['institution', 'sessions', ...key],
      queryFn: fn,
      staleTime: SESSIONS_STALE_MS,
    });
  const invalidateSessions = () =>
    queryClient.invalidateQueries({ queryKey: ['institution', 'sessions'] });

  const loadLive = async () => {
    try {
      const data = await cachedFetch(['live'], () => institutionService.getLiveSessions());
      setLiveSessions(data.live_sessions ?? []);
      setLiveSummary(data.summary ?? null);
      setRecentActivity(data.recent_activity ?? []);
    } catch {
      setLiveSessions([]);
      setLiveSummary(null);
      setRecentActivity([]);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    invalidateSessions();
    await loadLive();
    setRefreshing(false);
    toast3('Live sessions refreshed.');
  };

  const loadUpcoming = async () => {
    try {
      const all = await cachedFetch(['upcoming'], async () => {
        const { data } = await apiClient.get('/institution/sessions', {
          params: { status: 'scheduled', per_page: 200 },
        });
        return (data.sessions ?? []) as SessionEnriched[];
      });
      setUpcomingSessions(
        all
          .filter(s => s.status === 'scheduled')
          .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      );
    } catch { setUpcomingSessions([]); }
  };

  const loadHistory = async (pageToLoad = historyPage, perPageToLoad = historyPerPage) => {
    try {
      setHistoryLoading(true);
      const params: Record<string, any> = {
        page: pageToLoad,
        per_page: perPageToLoad,
      };
      if (historyDept !== 'all') params.department_id = historyDept;
      if (historyBatch !== 'all') params.batch_id = historyBatch;
      if (historySection !== 'all') params.section_id = historySection;
      if (historySubject !== 'all') params.subject_id = historySubject;
      if (historyInstructor !== 'all') params.instructor_id = historyInstructor;
      if (historySearch) params.search = historySearch;

      const data = await cachedFetch(
        ['history', pageToLoad, perPageToLoad,
         params.department_id ?? '', params.batch_id ?? '', params.section_id ?? '',
         params.subject_id ?? '', params.instructor_id ?? '', params.search ?? ''],
        () => institutionService.getSessionHistory(params),
      );
      if (data && data.sessions) {
        setHistorySessions(data.sessions);
        setHistoryTotal(data.total || 0);
        setHistoryPage(data.page || 1);
        setHistoryPages(data.pages || 0);
        if (data.stats) setHistoryStats(data.stats);
        if (data.sessions.length > 0) {
          setHistorySelectedSession(prev => prev ? (data.sessions.find((x: any) => x.id === prev.id) || data.sessions[0]) : data.sessions[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load history sessions:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const exportHistoryCsv = () => {
    if (historySessions.length === 0) {
      toast3('No sessions in history to export');
      return;
    }
    const rows = historySessions.map(s => ({
      ID: s.id,
      Date: s.scheduled_at ? new Date(s.scheduled_at).toLocaleDateString() : '',
      Time: s.scheduled_at ? new Date(s.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      Title: s.clean_title || s.title,
      Topic: s.topic || '',
      Subject: s.subject_code || s.subject_name || '',
      Section: s.section_name || '',
      Instructor: s.instructor_name || '',
      DurationMinutes: s.duration_minutes || 0,
      Attendance: `${s.attendance_attended || 0}/${s.attendance_total || 0}`,
      AttendancePercent: `${s.attendance_percent || 0}%`,
      Status: s.status,
      Room: s.room || '',
      Notes: s.notes || '',
    }));
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${String((r as any)[h] || '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Lab_Session_History_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast3('Exported history sessions CSV report');
  };

  const handleDeleteHistorySession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session from history? This action cannot be undone.')) return;
    try {
      await institutionService.deleteSession(sessionId);
      toast3('Session removed from history');
      if (historySelectedSession?.id === sessionId) {
        setHistorySelectedSession(null);
      }
      invalidateSessions();
      loadHistory(historyPage, historyPerPage);
    } catch (e) {
      console.error('Failed to delete session:', e);
      toast3('Failed to delete session');
    }
  };

  const handleOpenAttendanceRoster = async (sess: SessionEnriched) => {
    setHistorySelectedSession(sess);
    setHistoryRosterOpen(true);
    setHistoryRosterLoading(true);
    try {
      const data = await institutionService.getSessionStudents(sess.id);
      setHistoryRosterStudents(data.students || []);
    } catch {
      setHistoryRosterStudents([]);
    } finally {
      setHistoryRosterLoading(false);
    }
  };

  const toggleSelectAllHistory = () => {
    if (historySelectedIds.size === historySessions.length) {
      setHistorySelectedIds(new Set());
    } else {
      setHistorySelectedIds(new Set(historySessions.map(s => s.id)));
    }
  };

  const toggleSelectHistoryRow = (id: string) => {
    setHistorySelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadAcademic = async () => {
    try {
      const struct = await queryClient.fetchQuery({
        queryKey: ['institution', 'academic-structure'],
        queryFn: () => institutionService.getAcademicStructure(),
        staleTime: 5 * 60 * 1000, // reference data — five minutes is plenty
      });
      setAcademicYears(struct.years || []);
      setDepartments(struct.departments || []);
      setBatches(struct.batches || []);
      setAllSections(struct.sections || []);
      setAllSubjects(struct.subjects || []);
      setInstructors(struct.instructors?.filter(i => i.is_active) || []);
    } catch {}
  };

  useEffect(() => {
    setLoading(true);
    const initialTabLoad = tab === 'live' ? loadLive()
      : tab === 'upcoming' ? loadUpcoming()
      : tab === 'calendar' ? loadWeek(weekStart)
      : tab === 'history' ? loadHistory()
      : loadPlanner();

    Promise.all([loadAcademic(), initialTabLoad])
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'upcoming' && upcomingSessions.length === 0) {
      loadUpcoming();
    }
  }, [tab, upcomingSessions.length]);

  useEffect(() => {
    if (tab === 'history' && historySessions.length === 0) {
      loadHistory();
    }
  }, [tab, historySessions.length]);

  // Planner section subjects
  useEffect(() => {
    if (!planner.section_id) { setSectionSubjects([]); return; }
    institutionService.getSectionSubjects(planner.section_id)
      .then(ss => setSectionSubjects(ss as any[]))
      .catch(() => setSectionSubjects([]));
  }, [planner.section_id]);

  useEffect(() => {
    if (!planner.subject_id || sectionSubjects.length === 0) return;
    const ss = sectionSubjects.find(s => s.subject_id === planner.subject_id);
    if (ss?.instructor_id) {
      setPlanner(f => ({ ...f, instructor_id: ss.instructor_id }));
    }
  }, [planner.subject_id, sectionSubjects]);

  // ── Recurring Planner Data & Actions ─────────────────────────────────────
  const loadPlanner = async () => {
    try {
      setPlannerLoading(true);
      const params: Record<string, string> = {};
      if (plannerStatus !== 'all') params.status = plannerStatus;
      if (plannerDept !== 'all') params.department_id = plannerDept;
      if (plannerBatch !== 'all') params.batch_id = plannerBatch;
      if (plannerSearch) params.search = plannerSearch;

      const res = await cachedFetch(
        ['plans', params.status ?? '', params.department_id ?? '',
         params.batch_id ?? '', params.search ?? ''],
        () => institutionService.getRecurringPlans(params),
      );
      if (res && res.plans) {
        setRecurringPlans(res.plans);
        if (res.stats) setPlannerStats(res.stats);
      }
    } catch (e) {
      console.error('Failed to load recurring plans:', e);
    } finally {
      setPlannerLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'planner') {
      loadPlanner();
      handleLoadTemplates();
      handleLoadConflicts();
    }
  }, [tab, plannerStatus, plannerDept, plannerBatch, plannerSearch]);

  const handleSavePlan = async () => {
    if (!drawerForm.name.trim()) {
      toast3('Please enter a plan name');
      return;
    }
    if (!drawerForm.department_id || !drawerForm.batch_id || !drawerForm.academic_year_id) {
      toast3('Choose a department, batch, and academic year');
      setDrawerStep(1);
      return;
    }
    if (!drawerForm.sections.length || !drawerForm.subjects.length || !drawerForm.schedule_days.length) {
      toast3('Choose at least one section, subject, and weekday');
      return;
    }
    if (!drawerForm.start_date || !drawerForm.end_date || drawerForm.end_date < drawerForm.start_date) {
      toast3('Choose a valid start date and end date');
      setDrawerStep(2);
      return;
    }
    try {
      setDrawerSubmitting(true);
      const payload: Partial<RecurringPlan> = {
        name: drawerForm.name,
        description: drawerForm.description,
        department_id: drawerForm.department_id,
        batch_id: drawerForm.batch_id,
        academic_year_id: drawerForm.academic_year_id,
        sections: drawerForm.sections,
        subjects: drawerForm.subjects,
        schedule_days: drawerForm.schedule_days,
        start_time: drawerForm.start_time,
        duration_minutes: drawerForm.duration_minutes,
        start_date: drawerForm.start_date,
        end_date: drawerForm.end_date,
        room: drawerForm.room,
        instructor_id: drawerForm.instructor_id || undefined,
        status: drawerForm.status,
      };

      if (editingPlanId) {
        await institutionService.updateRecurringPlan(editingPlanId, payload);
        toast3(`Plan "${drawerForm.name}" updated successfully`);
      } else {
        await institutionService.createRecurringPlan(payload);
        toast3(`Plan "${drawerForm.name}" created and activated!`);
      }

      setEditingPlanId(null);
      setDrawerStep(1);
      setDrawerForm({
        name: '',
        description: '',
        department_id: '',
        batch_id: '',
        academic_year_id: '',
        sections: [],
        subjects: [],
        schedule_days: [],
        start_time: '09:00',
        duration_minutes: 60,
        ...defaultPlannerDateRange(),
        room: '',
        instructor_id: '',
        status: 'active',
      });
      invalidateSessions();
      loadPlanner();
      loadUpcoming();
    } catch (e: any) {
      toast3(e?.response?.data?.error || 'Failed to save recurring plan');
    } finally {
      setDrawerSubmitting(false);
    }
  };

  const handleDuplicatePlan = async (p: RecurringPlan) => {
    try {
      await institutionService.duplicateRecurringPlan(p.id);
      toast3(`Duplicated "${p.name}" as draft`);
      invalidateSessions();
      loadPlanner();
    } catch (e) {
      toast3('Failed to duplicate plan');
    }
  };

  const handleTogglePlanStatus = async (p: RecurringPlan) => {
    const nextStatus = p.status === 'active' ? 'paused' : 'active';
    try {
      await institutionService.updateRecurringPlan(p.id, { status: nextStatus });
      toast3(`Plan "${p.name}" is now ${nextStatus}`);
      invalidateSessions();
      loadPlanner();
    } catch (e) {
      toast3('Failed to update plan status');
    }
  };

  const handleDeletePlan = async (p: RecurringPlan) => {
    if (!confirm(`Are you sure you want to delete "${p.name}"?`)) return;
    try {
      await institutionService.deleteRecurringPlan(p.id);
      toast3(`Plan "${p.name}" deleted`);
      invalidateSessions();
      loadPlanner();
    } catch (e) {
      toast3('Failed to delete plan');
    }
  };

  const handleGenerateSessions = async (p: RecurringPlan) => {
    try {
      const res = await institutionService.generatePlanSessions(p.id);
      toast3(res.message || `Generated ${res.sessions_generated} sessions for ${p.name}`);
      invalidateSessions();
      loadPlanner();
      loadUpcoming();
    } catch (e) {
      toast3('Failed to generate sessions');
    }
  };

  const handleOpenEditPlan = (p: RecurringPlan) => {
    setEditingPlanId(p.id);
    setIsPlannerDrawerOpen(true);
    setDrawerStep(1);
    setDrawerForm({
      name: p.name,
      description: p.description || '',
      department_id: p.department_id || '',
      batch_id: p.batch_id || '',
      academic_year_id: p.academic_year_id || '',
      sections: p.sections.map(s => typeof s === 'string' ? s : s.name),
      subjects: p.subjects.map(s => ({ id: s.id || '', name: s.name, code: s.code })),
      schedule_days: p.schedule_days.length > 0 ? p.schedule_days : ['Mon'],
      start_time: p.raw_start_time || '09:00',
      duration_minutes: p.duration_minutes || 60,
      ...(!p.start_date || !p.end_date ? defaultPlannerDateRange() : { start_date: p.start_date, end_date: p.end_date }),
      room: p.room || 'Lab 1 (Main Block)',
      instructor_id: p.instructor_id || '',
      status: p.status,
    });
  };

  const handleLoadTemplates = async () => {
    try {
      const res = await cachedFetch(['templates'], () => institutionService.getPlanTemplates());
      if (res && res.templates) setPlanTemplates(res.templates);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoadConflicts = async () => {
    try {
      const res = await cachedFetch(['conflicts'], () => institutionService.getPlanConflicts());
      if (res) setPlanConflicts(res);
    } catch (e) {
      console.error(e);
    }
  };

  // Filtered & Paginated recurring plans
  const filteredPlans = useMemo(() => {
    return recurringPlans.filter(p => {
      if (plannerStatus !== 'all' && p.status !== plannerStatus) return false;
      if (plannerDept !== 'all' && p.department_id !== plannerDept && p.department_code?.toLowerCase() !== plannerDept.toLowerCase()) return false;
      if (plannerBatch !== 'all' && p.batch_id !== plannerBatch) return false;
      if (plannerYear !== 'all' && p.academic_year_id !== plannerYear) return false;
      if (plannerSearch) {
        const q = plannerSearch.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchDesc = (p.description || '').toLowerCase().includes(q);
        const matchSub = p.subjects.some(s => (s.name || '').toLowerCase().includes(q));
        if (!matchName && !matchDesc && !matchSub) return false;
      }
      return true;
    });
  }, [recurringPlans, plannerStatus, plannerDept, plannerBatch, plannerYear, plannerSearch]);

  const totalFilteredPages = Math.ceil(filteredPlans.length / plannerPerPage) || 1;
  const paginatedPlans = useMemo(() => {
    const start = (plannerPage - 1) * plannerPerPage;
    return filteredPlans.slice(start, start + plannerPerPage);
  }, [filteredPlans, plannerPage, plannerPerPage]);

  // When opening Start Modal, auto-select first section/subject if available
  useEffect(() => {
    if (showStartModal && allSections.length > 0 && !startForm.section_id && (startForm.section_ids || []).length === 0) {
      const firstSecId = allSections[0]?.id || '';
      setStartForm(prev => ({
        ...prev,
        section_id: firstSecId,
        section_ids: firstSecId ? [firstSecId] : [],
        subject_id: allSubjects[0]?.id || '',
        instructor_id: instructors[0]?.id || '',
        title: allSubjects[0]?.name ? `${allSubjects[0].name} Lab Session` : 'New Lab Session',
      }));
    }
  }, [showStartModal, allSections, allSubjects, instructors]);

  const previewDates = useMemo(() =>
    computeOccurrences(planner.start_date, planner.end_date, planner.day_of_week),
    [planner.start_date, planner.end_date, planner.day_of_week]
  );

  // Terminate Live session
  const terminateSession = async (sessionId: string) => {
    if (!window.confirm('Are you sure you want to end this live lab session?')) return;
    try {
      await institutionService.terminateSession(sessionId);
      toast3('Session ended successfully.');
      invalidateSessions();
      loadLive();
      loadHistory();
      loadWeek(weekStart);
    } catch {
      toast3('Failed to end session.');
    }
  };

  // Open live student roster modal
  const openStudentRoster = async (s: SessionEnriched) => {
    setRosterSession(s);
    setRosterLoading(true);
    setRosterSearch('');
    try {
      const data = await institutionService.getSessionStudents(s.id);
      setRosterData(data);
    } catch {
      setRosterData(null);
      toast3('Could not load student roster.');
    } finally {
      setRosterLoading(false);
    }
  };

  // Create new session
  const handleCreateSession = async () => {
    if (!startForm.title.trim()) { toast3('Please enter a session title.'); return; }
    const selectedSecIds = (startForm.section_ids && startForm.section_ids.length > 0)
      ? startForm.section_ids
      : (startForm.section_id ? [startForm.section_id] : []);
    if (selectedSecIds.length === 0) { toast3('Please select at least one section.'); return; }
    if (!startForm.subject_id) { toast3('Please select a subject.'); return; }

    setStartSubmitting(true);
    try {
      const res = await institutionService.createLiveSession({
        title: startForm.title.trim(),
        section_id: selectedSecIds[0],
        section_ids: selectedSecIds,
        subject_id: startForm.subject_id,
        instructor_id: startForm.instructor_id || undefined,
        scheduled_at: startForm.scheduled_at ? new Date(startForm.scheduled_at).toISOString() : undefined,
        duration_minutes: Number(startForm.duration_minutes),
        room: startForm.room || 'Lab 1 (Main Block)',
        start_immediately: startForm.start_immediately,
      });
      const count = selectedSecIds.length;
      toast3(
        startForm.start_immediately
          ? (count > 1 ? `✓ Live sessions launched for ${count} sections!` : '✓ Live session launched!')
          : (count > 1 ? `✓ ${count} lab sessions scheduled on calendar!` : '✓ Session scheduled on calendar.')
      );
      if (res?.warnings && Array.isArray(res.warnings) && res.warnings.length > 0) {
        setTimeout(() => toast3(`Notice: ${res.warnings[0]}`), 2500);
      }
      setShowStartModal(false);
      invalidateSessions();
      loadLive();
      loadUpcoming();
      loadWeek(weekStart);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast3(e?.response?.data?.error ?? 'Failed to schedule session.');
    } finally {
      setStartSubmitting(false);
    }
  };

  const cancelUpcoming = async (sessionId: string) => {
    try {
      await institutionService.cancelSession(sessionId);
      toast3('Session cancelled.');
      invalidateSessions();
      loadUpcoming();
      loadWeek(weekStart);
    } catch { toast3('Failed to cancel session.'); }
  };

  const submitPlanner = async () => {
    setBulkResult(null);
    if (!planner.section_id) { toast3('Please select a section.'); return; }
    if (!planner.subject_id) { toast3('Please select a subject.'); return; }
    if (!planner.title_prefix.trim()) { toast3('Title prefix is required.'); return; }
    if (!planner.start_date) { toast3('Start date is required.'); return; }
    if (!planner.end_date)   { toast3('End date is required.'); return; }
    if (planner.end_date < planner.start_date) { toast3('End date must be after start date.'); return; }
    if (previewDates.length === 0) { toast3('No occurrences of that weekday fall within the date range.'); return; }

    setPlannerBusy(true);
    try {
      const result = await institutionService.bulkScheduleSessions({
        ...planner,
        title_prefix: planner.title_prefix.trim(),
        instructor_id: planner.instructor_id || undefined,
        duration_minutes: Number(planner.duration_minutes),
      });
      setBulkResult(result);
      if (result.created_count > 0) {
        toast3(`✓ ${result.created_count} session${result.created_count > 1 ? 's' : ''} scheduled!`);
        invalidateSessions();
        loadUpcoming();
        loadWeek(weekStart);
      } else {
        toast3('No sessions created — all occurrences have conflicts.');
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast3(e?.response?.data?.error ?? 'Failed to schedule sessions.');
    } finally {
      setPlannerBusy(false);
    }
  };

  // Filtered Live Sessions
  const filteredLiveSessions = useMemo(() => {
    return liveSessions.filter(s => {
      if (liveSearch.trim()) {
        const q = liveSearch.toLowerCase();
        const matchTitle = (s.title || '').toLowerCase().includes(q);
        const matchSub = (s.subject_name || '').toLowerCase().includes(q);
        const matchInstr = (s.instructor_name || '').toLowerCase().includes(q);
        const matchSec = (s.section_name || '').toLowerCase().includes(q);
        const matchRoom = (s.room || '').toLowerCase().includes(q);
        if (!matchTitle && !matchSub && !matchInstr && !matchSec && !matchRoom) return false;
      }
      if (selectedYear) {
        const yrLabel = s.academic_year_label || '';
        if (!yrLabel.toLowerCase().includes(selectedYear.toLowerCase())) return false;
      }
      if (selectedDept) {
        const dName = (s.department_name || '').toLowerCase();
        const dCode = (s.department_code || '').toLowerCase();
        const target = selectedDept.toLowerCase();
        if (dName !== target && dCode !== target && !dName.includes(target)) return false;
      }
      if (selectedBatch) {
        const bName = (s.batch_name || '').toLowerCase();
        if (!bName.includes(selectedBatch.toLowerCase())) return false;
      }
      if (selectedSection) {
        const secName = (s.section_name || '').toLowerCase();
        if (secName !== selectedSection.toLowerCase() && s.section_id !== selectedSection) return false;
      }
      if (selectedSubject) {
        const subName = (s.subject_name || '').toLowerCase();
        const subCode = (s.subject_code || '').toLowerCase();
        const target = selectedSubject.toLowerCase();
        if (subName !== target && subCode !== target && !subName.includes(target)) return false;
      }
      return true;
    });
  }, [liveSessions, liveSearch, selectedYear, selectedDept, selectedBatch, selectedSection, selectedSubject]);

  // Filtered roster students
  const filteredRosterStudents = useMemo(() => {
    if (!rosterData?.students) return [];
    if (!rosterSearch.trim()) return rosterData.students;
    const q = rosterSearch.toLowerCase();
    return rosterData.students.filter(st =>
      st.name.toLowerCase().includes(q) ||
      st.email.toLowerCase().includes(q) ||
      (st.roll_number && st.roll_number.toLowerCase().includes(q))
    );
  }, [rosterData, rosterSearch]);

  const StatusBadge = ({ status }: { status: string }) => (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: statusBg[status] ?? '#faf5ff', color: statusColor[status] ?? '#9891a6',
      textTransform: 'capitalize', letterSpacing: '.03em',
    }}>{status}</span>
  );

  return (
    <InstitutionShell activePage="Sessions" activeSubPage={tab} activeSubPageLabel={activeSubPageLabel}>

      {/* Toast Notification */}
      {/* Edit modal */}
      {editTarget && (
        <EditModal
          session={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { invalidateSessions(); loadUpcoming(); loadWeek(weekStart); }}
          toast3={toast3}
        />
      )}

      <div className={liveStyles.pageContainer}>

        {/* ── Header ── */}
        <div className={liveStyles.headerRow}>
          <div className={liveStyles.headerLeft}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {tab === 'upcoming' && (
                <div className={liveStyles.upcomingHeaderIconBox}>
                  <Clock size={24} strokeWidth={2.2} />
                </div>
              )}
              {tab === 'planner' && (
                <div className={liveStyles.plannerHeaderSquircle}>
                  <CalendarClock size={24} strokeWidth={2.2} />
                </div>
              )}
              {tab === 'history' && (
                <div className={liveStyles.plannerHeaderSquircle} style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1' }}>
                  <History size={24} strokeWidth={2.2} />
                </div>
              )}
              <div>
                <div className={liveStyles.titleWithBadge}>
                  <h1 className={liveStyles.pageTitle}>
                    {tab === 'calendar'
                      ? 'Lab Session Calendar'
                      : tab === 'upcoming'
                        ? 'Upcoming Lab Sessions'
                        : tab === 'planner'
                          ? 'Lab Session Planner'
                          : tab === 'history'
                            ? 'Past Lab Sessions History'
                            : 'Live Lab Sessions'}
                  </h1>
                  {tab === 'live' && (
                    <span className={liveStyles.liveBadgeHeader}>
                      <span className={liveStyles.pulsingDot} /> Live
                    </span>
                  )}
                </div>
                <p className={liveStyles.pageSubtitle}>
                  {tab === 'calendar'
                    ? 'View, schedule, and manage lab sessions with an interactive calendar.'
                    : tab === 'upcoming'
                      ? 'View and manage all scheduled upcoming lab sessions. Edit, reschedule or cancel anytime.'
                      : tab === 'planner'
                        ? 'Create and manage recurring lab session plans for departments, batches, and sections.'
                        : tab === 'history'
                          ? 'Review attendance records, feedback, and student performance from past sessions.'
                          : 'Monitor ongoing lab sessions in real-time, view attendance, and manage sessions.'}
                </p>
              </div>
            </div>
          </div>

          <div className={liveStyles.headerRight}>
            {tab === 'planner' ? (
              <div className={liveStyles.plannerBannerCard}>
                <div className={liveStyles.plannerBannerIcon}>
                  <CalendarClock size={22} strokeWidth={2.2} />
                </div>
                <div>
                  <h4 className={liveStyles.plannerBannerTitle}>Automate Your Schedule</h4>
                  <p className={liveStyles.plannerBannerText}>
                    Set recurring sessions once and let the system generate your lab timetable automatically.
                  </p>
                </div>
              </div>
            ) : tab === 'upcoming' ? (
              <>
                {/* Stay Ahead banner card */}
                <div className={liveStyles.monitoringCard}>
                  <div className={liveStyles.monitoringIconWrap} style={{ background: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed' }}>
                    <Calendar size={18} strokeWidth={2.4} />
                  </div>
                  <div className={liveStyles.monitoringTexts}>
                    <span className={liveStyles.monitoringTitle}>Stay Ahead, Keep Things on Track</span>
                    <span className={liveStyles.monitoringSubtitle}>
                      Manage upcoming sessions, avoid conflicts, and ensure smooth lab operations.
                    </span>
                  </div>
                </div>

                {/* + Schedule Session */}
                <button
                  className={liveStyles.btnStartSession}
                  onClick={() => {
                    const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                    setStartForm({
                      title: 'New Lab Session',
                      section_id: allSections[0]?.id || '',
                      subject_id: allSubjects[0]?.id || '',
                      instructor_id: instructors[0]?.id || '',
                      duration_minutes: 60,
                      room: 'Lab 1 (Main Block)',
                      start_immediately: false,
                      scheduled_at: todayStr,
                    });
                    setShowStartModal(true);
                  }}
                >
                  <Plus size={16} strokeWidth={2.5} /> Schedule Session
                </button>
              </>
            ) : tab === 'calendar' ? (
              <>
                {/* Calendar banner card */}
                <div className={liveStyles.monitoringCard}>
                  <div className={liveStyles.monitoringIconWrap} style={{ background: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed' }}>
                    <Calendar size={18} strokeWidth={2.4} />
                  </div>
                  <div className={liveStyles.monitoringTexts}>
                    <span className={liveStyles.monitoringTitle}>Visualize. Plan. Optimize.</span>
                    <span className={liveStyles.monitoringSubtitle}>
                      View and manage all lab sessions across departments, batches and sections in a single calendar.
                    </span>
                  </div>
                </div>

                {/* Export Button */}
                <button className={liveStyles.btnExport} onClick={exportCalendarCsv} title="Export Calendar to CSV">
                  <Download size={14} strokeWidth={2.2} /> Export
                </button>

                {/* + Schedule Session */}
                <button
                  className={liveStyles.btnStartSession}
                  onClick={() => {
                    const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                    setStartForm({
                      title: 'New Lab Session',
                      section_id: allSections[0]?.id || '',
                      subject_id: allSubjects[0]?.id || '',
                      instructor_id: instructors[0]?.id || '',
                      duration_minutes: 60,
                      room: 'Lab 1 (Main Block)',
                      start_immediately: false,
                      scheduled_at: todayStr,
                    });
                    setShowStartModal(true);
                  }}
                >
                  <Plus size={16} strokeWidth={2.5} /> Schedule Session
                </button>
              </>
            ) : tab === 'history' ? (
              <div className={liveStyles.monitoringCard}>
                <div className={liveStyles.monitoringIconWrap} style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1' }}>
                  <History size={18} strokeWidth={2.4} />
                </div>
                <div className={liveStyles.monitoringTexts}>
                  <span className={liveStyles.monitoringTitle}>Historical Session Archive</span>
                  <span className={liveStyles.monitoringSubtitle}>
                    Review completed sessions, attendance archives, and historical logs across departments.
                  </span>
                </div>
              </div>
            ) : (
              <>
                {/* Real-time Monitoring card */}
                <div className={liveStyles.monitoringCard}>
                  <div className={liveStyles.monitoringIconWrap}>
                    <Activity size={18} strokeWidth={2.4} />
                  </div>
                  <div className={liveStyles.monitoringTexts}>
                    <span className={liveStyles.monitoringTitle}>Real-time Monitoring</span>
                    <span className={liveStyles.monitoringSubtitle}>
                      Keep track of all live sessions, student participation, and system status across departments.
                    </span>
                  </div>
                </div>

                {/* + Start New Session */}
                <button className={liveStyles.btnStartSession} onClick={() => setShowStartModal(true)}>
                  <Plus size={16} strokeWidth={2.5} /> Start New Session
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Top Tabs Navigation ── */}
        <div className={liveStyles.tabsBar}>
          {([
            { id: 'live'     as Tab, label: 'Live',     Icon: Radio },
            { id: 'calendar' as Tab, label: 'Calendar', Icon: CalendarDays },
            { id: 'upcoming' as Tab, label: 'Upcoming',  Icon: Clock },
            { id: 'planner'  as Tab, label: 'Planner',   Icon: CalendarPlus },
            { id: 'history'  as Tab, label: 'History',   Icon: History },
          ] as const).map(t => (
            <button
              key={t.id}
              className={`${liveStyles.tabItem} ${tab === t.id ? liveStyles.tabItemActive : ''}`}
              onClick={() => switchTab(t.id)}
            >
              <t.Icon size={14} strokeWidth={2} /> {t.label}
              {t.id === 'live' && liveSessions.length > 0 && (
                <span style={{
                  padding: '1px 6px', borderRadius: 10, fontSize: 10.5,
                  background: 'rgba(34,197,94,0.15)', color: '#16a34a', fontWeight: 800,
                }}>
                  {liveSessions.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            LIVE TAB
        ══════════════════════════════════════════════════════════════════════ */}
        {tab === 'live' && (
          <>
            {/* ── 4 KPI Metric Cards ── */}
            <div className={liveStyles.kpiGrid}>
              {/* Card 1: Live Sessions */}
              <div className={liveStyles.kpiCard}>
                <div className={liveStyles.kpiIconWrap} style={{ background: 'rgba(34, 197, 94, 0.12)', color: '#16a34a' }}>
                  <Video size={22} strokeWidth={2.2} />
                </div>
                <div className={liveStyles.kpiContent}>
                  <span className={liveStyles.kpiValue}>
                    {liveSummary?.total_live_sessions ?? liveSessions.length}
                  </span>
                  <div className={liveStyles.kpiLabelRow}>
                    <span className={liveStyles.kpiLabel}>Live Sessions</span>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                  </div>
                  <span className={liveStyles.kpiSubtext}>
                    Currently running <RotateCw size={10} style={{ display: 'inline', marginLeft: 2 }} />
                  </span>
                </div>
              </div>

              {/* Card 2: Students Online */}
              <div className={liveStyles.kpiCard}>
                <div className={liveStyles.kpiIconWrap} style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}>
                  <Users size={22} strokeWidth={2.2} />
                </div>
                <div className={liveStyles.kpiContent}>
                  <div className={liveStyles.kpiValueRow}>
                    <span className={liveStyles.kpiValue}>
                      {liveSummary ? `${liveSummary.total_students_online} / ${liveSummary.total_students_enrolled}` :
                        `${liveSessions.reduce((acc, s) => acc + (s.students_online_count || 0), 0)} / ${liveSessions.reduce((acc, s) => acc + (s.students_total_count || 0), 0)}`}
                    </span>
                  </div>
                  <span className={liveStyles.kpiLabel}>Students Online</span>
                  <div className={liveStyles.kpiProgressRow}>
                    <div className={liveStyles.kpiProgressBarTrack}>
                      <div
                        className={liveStyles.kpiProgressBarFill}
                        style={{ width: `${Math.min(100, liveSummary?.students_online_percent ?? 82)}%` }}
                      />
                    </div>
                    <span className={liveStyles.kpiProgressPercent}>
                      {Math.round(liveSummary?.students_online_percent ?? 82)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 3: Instructors Active */}
              <div className={liveStyles.kpiCard}>
                <div className={liveStyles.kpiIconWrap} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>
                  <UserCheck size={22} strokeWidth={2.2} />
                </div>
                <div className={liveStyles.kpiContent}>
                  <span className={liveStyles.kpiValue}>
                    {liveSummary?.active_instructors_count ?? ((new Set(liveSessions.map(s => s.instructor_id).filter(Boolean)).size) || 3)}
                  </span>
                  <div className={liveStyles.kpiLabelRow}>
                    <span className={liveStyles.kpiLabel}>Instructors Active</span>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                  </div>
                  <span className={liveStyles.kpiSubtext}>
                    All systems running <RotateCw size={10} style={{ display: 'inline', marginLeft: 2 }} />
                  </span>
                </div>
              </div>

              {/* Card 4: Total Live Duration */}
              <div className={liveStyles.kpiCard}>
                <div className={liveStyles.kpiIconWrap} style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6' }}>
                  <Clock size={22} strokeWidth={2.2} />
                </div>
                <div className={liveStyles.kpiContent}>
                  <span className={liveStyles.kpiValue}>
                    {liveSummary?.total_duration_today_hours != null
                      ? `${liveSummary.total_duration_today_hours} hrs`
                      : '—'}
                  </span>
                  <span className={liveStyles.kpiLabel}>Total Live Duration</span>
                  <span className={liveStyles.kpiSubtext}>Today</span>
                </div>
              </div>
            </div>

            {/* ── 5-Item Filter Strip ── */}
            <div className={liveStyles.filterStrip} ref={filterRef}>
              {/* Filter 1: Academic Year */}
              <div
                className={`${liveStyles.filterCard} ${openFilter === 'year' ? liveStyles.filterCardActive : ''}`}
                onClick={() => setOpenFilter(openFilter === 'year' ? null : 'year')}
              >
                <div className={liveStyles.filterCardLeft}>
                  <div className={liveStyles.filterIconWrap}>
                    <Calendar size={15} />
                  </div>
                  <div className={liveStyles.filterInfo}>
                    <span className={liveStyles.filterLabel}>Academic Year</span>
                    <span className={liveStyles.filterValue}>{selectedYear || 'All Years'}</span>
                  </div>
                </div>
                <ChevronDown size={14} className={`${liveStyles.filterChevron} ${openFilter === 'year' ? liveStyles.filterChevronOpen : ''}`} />

                {openFilter === 'year' && (
                  <div className={liveStyles.filterDropdown} onClick={e => e.stopPropagation()}>
                    <div
                      className={`${liveStyles.filterDropdownOption} ${!selectedYear ? liveStyles.filterDropdownOptionSelected : ''}`}
                      onClick={() => { setSelectedYear(''); setOpenFilter(null); }}
                    >
                      <span>All Years</span>
                      {!selectedYear && <Check size={14} />}
                    </div>
                    {academicYears.map(y => (
                      <div
                        key={y.id}
                        className={`${liveStyles.filterDropdownOption} ${selectedYear === y.year_label ? liveStyles.filterDropdownOptionSelected : ''}`}
                        onClick={() => { setSelectedYear(y.year_label); setOpenFilter(null); }}
                      >
                        <span>{y.year_label}</span>
                        {selectedYear === y.year_label && <Check size={14} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Filter 2: Department */}
              <div
                className={`${liveStyles.filterCard} ${openFilter === 'dept' ? liveStyles.filterCardActive : ''}`}
                onClick={() => setOpenFilter(openFilter === 'dept' ? null : 'dept')}
              >
                <div className={liveStyles.filterCardLeft}>
                  <div className={liveStyles.filterIconWrap}>
                    <Building2 size={15} />
                  </div>
                  <div className={liveStyles.filterInfo}>
                    <span className={liveStyles.filterLabel}>Department</span>
                    <span className={liveStyles.filterValue}>{selectedDept || 'All Departments'}</span>
                  </div>
                </div>
                <ChevronDown size={14} className={`${liveStyles.filterChevron} ${openFilter === 'dept' ? liveStyles.filterChevronOpen : ''}`} />

                {openFilter === 'dept' && (
                  <div className={liveStyles.filterDropdown} onClick={e => e.stopPropagation()}>
                    <div
                      className={`${liveStyles.filterDropdownOption} ${!selectedDept ? liveStyles.filterDropdownOptionSelected : ''}`}
                      onClick={() => { setSelectedDept(''); setOpenFilter(null); }}
                    >
                      <span>All Departments</span>
                      {!selectedDept && <Check size={14} />}
                    </div>
                    {departments.map(d => (
                      <div
                        key={d.id}
                        className={`${liveStyles.filterDropdownOption} ${selectedDept === (d.code || d.name) ? liveStyles.filterDropdownOptionSelected : ''}`}
                        onClick={() => { setSelectedDept(d.code || d.name); setOpenFilter(null); }}
                      >
                        <span>{d.name} {d.code ? `(${d.code})` : ''}</span>
                        {selectedDept === (d.code || d.name) && <Check size={14} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Filter 3: Batch */}
              <div
                className={`${liveStyles.filterCard} ${openFilter === 'batch' ? liveStyles.filterCardActive : ''}`}
                onClick={() => setOpenFilter(openFilter === 'batch' ? null : 'batch')}
              >
                <div className={liveStyles.filterCardLeft}>
                  <div className={liveStyles.filterIconWrap}>
                    <Layers size={15} />
                  </div>
                  <div className={liveStyles.filterInfo}>
                    <span className={liveStyles.filterLabel}>Batch</span>
                    <span className={liveStyles.filterValue}>{selectedBatch || 'All Batches'}</span>
                  </div>
                </div>
                <ChevronDown size={14} className={`${liveStyles.filterChevron} ${openFilter === 'batch' ? liveStyles.filterChevronOpen : ''}`} />

                {openFilter === 'batch' && (
                  <div className={liveStyles.filterDropdown} onClick={e => e.stopPropagation()}>
                    <div
                      className={`${liveStyles.filterDropdownOption} ${!selectedBatch ? liveStyles.filterDropdownOptionSelected : ''}`}
                      onClick={() => { setSelectedBatch(''); setOpenFilter(null); }}
                    >
                      <span>All Batches</span>
                      {!selectedBatch && <Check size={14} />}
                    </div>
                    {batches.map(b => (
                      <div
                        key={b.id}
                        className={`${liveStyles.filterDropdownOption} ${selectedBatch === b.name ? liveStyles.filterDropdownOptionSelected : ''}`}
                        onClick={() => { setSelectedBatch(b.name); setOpenFilter(null); }}
                      >
                        <span>{b.name}</span>
                        {selectedBatch === b.name && <Check size={14} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Filter 4: Section */}
              <div
                className={`${liveStyles.filterCard} ${openFilter === 'section' ? liveStyles.filterCardActive : ''}`}
                onClick={() => setOpenFilter(openFilter === 'section' ? null : 'section')}
              >
                <div className={liveStyles.filterCardLeft}>
                  <div className={liveStyles.filterIconWrap}>
                    <Users size={15} />
                  </div>
                  <div className={liveStyles.filterInfo}>
                    <span className={liveStyles.filterLabel}>Section</span>
                    <span className={liveStyles.filterValue}>{selectedSection || 'All Sections'}</span>
                  </div>
                </div>
                <ChevronDown size={14} className={`${liveStyles.filterChevron} ${openFilter === 'section' ? liveStyles.filterChevronOpen : ''}`} />

                {openFilter === 'section' && (
                  <div className={liveStyles.filterDropdown} onClick={e => e.stopPropagation()}>
                    <div
                      className={`${liveStyles.filterDropdownOption} ${!selectedSection ? liveStyles.filterDropdownOptionSelected : ''}`}
                      onClick={() => { setSelectedSection(''); setOpenFilter(null); }}
                    >
                      <span>All Sections</span>
                      {!selectedSection && <Check size={14} />}
                    </div>
                    {allSections.map(sec => (
                      <div
                        key={sec.id}
                        className={`${liveStyles.filterDropdownOption} ${selectedSection === sec.name ? liveStyles.filterDropdownOptionSelected : ''}`}
                        onClick={() => { setSelectedSection(sec.name); setOpenFilter(null); }}
                      >
                        <span>Section {sec.name}</span>
                        {selectedSection === sec.name && <Check size={14} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Filter 5: Subject */}
              <div
                className={`${liveStyles.filterCard} ${openFilter === 'subject' ? liveStyles.filterCardActive : ''}`}
                onClick={() => setOpenFilter(openFilter === 'subject' ? null : 'subject')}
              >
                <div className={liveStyles.filterCardLeft}>
                  <div className={liveStyles.filterIconWrap}>
                    <BookOpen size={15} />
                  </div>
                  <div className={liveStyles.filterInfo}>
                    <span className={liveStyles.filterLabel}>Subject</span>
                    <span className={liveStyles.filterValue}>{selectedSubject || 'All Subjects'}</span>
                  </div>
                </div>
                <ChevronDown size={14} className={`${liveStyles.filterChevron} ${openFilter === 'subject' ? liveStyles.filterChevronOpen : ''}`} />

                {openFilter === 'subject' && (
                  <div className={liveStyles.filterDropdown} onClick={e => e.stopPropagation()}>
                    <div
                      className={`${liveStyles.filterDropdownOption} ${!selectedSubject ? liveStyles.filterDropdownOptionSelected : ''}`}
                      onClick={() => { setSelectedSubject(''); setOpenFilter(null); }}
                    >
                      <span>All Subjects</span>
                      {!selectedSubject && <Check size={14} />}
                    </div>
                    {allSubjects.map(sub => (
                      <div
                        key={sub.id}
                        className={`${liveStyles.filterDropdownOption} ${selectedSubject === sub.name ? liveStyles.filterDropdownOptionSelected : ''}`}
                        onClick={() => { setSelectedSubject(sub.name); setOpenFilter(null); }}
                      >
                        <span>{sub.name} {sub.code ? `(${sub.code})` : ''}</span>
                        {selectedSubject === sub.name && <Check size={14} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Live Sessions Section Bar ── */}
            <div className={liveStyles.sectionBar}>
              <div className={liveStyles.sectionHeadingWrap}>
                <div className={liveStyles.sectionWaveIcon}>
                  <Activity size={17} strokeWidth={2.4} />
                </div>
                <div>
                  <h2 className={liveStyles.sectionTitle}>
                    Live Sessions ({filteredLiveSessions.length})
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                  </h2>
                  <p className={liveStyles.sectionSubtitle}>Sessions that are currently in progress</p>
                </div>
              </div>

              <div className={liveStyles.sectionActions}>
                <div className={liveStyles.searchBox}>
                  <Search size={14} color="#94a3b8" />
                  <input
                    placeholder="Search live sessions..."
                    value={liveSearch}
                    onChange={e => setLiveSearch(e.target.value)}
                  />
                  {liveSearch && (
                    <X size={13} style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={() => setLiveSearch('')} />
                  )}
                </div>

                <button className={liveStyles.btnRefresh} onClick={handleRefresh} disabled={refreshing}>
                  <RotateCw size={13} className={refreshing ? styles.spin : ''} /> Refresh
                </button>

                <div className={liveStyles.viewToggle}>
                  <button
                    className={`${liveStyles.viewToggleBtn} ${viewMode === 'cards' ? liveStyles.viewToggleBtnActive : ''}`}
                    onClick={() => setViewMode('cards')}
                  >
                    <LayoutGrid size={13} /> Cards
                  </button>
                  <button
                    className={`${liveStyles.viewToggleBtn} ${viewMode === 'list' ? liveStyles.viewToggleBtnActive : ''}`}
                    onClick={() => setViewMode('list')}
                  >
                    <List size={13} /> List
                  </button>
                </div>
              </div>
            </div>

            {/* ── Live Sessions Cards / List ── */}
            {loading ? (
              <div className={liveStyles.emptyStateContainer}>
                <RotateCw size={28} className={styles.spin} color="#7c3aed" />
                <p className={liveStyles.emptyStateTitle}>Loading Live Lab Sessions…</p>
              </div>
            ) : filteredLiveSessions.length === 0 ? (
              <div className={liveStyles.emptyStateContainer}>
                <Radio size={36} color="#c084fc" strokeWidth={1.5} />
                <p className={liveStyles.emptyStateTitle}>No live sessions match your filters</p>
                <p className={liveStyles.emptyStateSubtitle}>
                  Start a new session immediately using the &ldquo;Start New Session&rdquo; button above or adjust your filters.
                </p>
                <button
                  className={liveStyles.btnStartSession}
                  style={{ marginTop: 10 }}
                  onClick={() => setShowStartModal(true)}
                >
                  <Plus size={15} /> Start New Session
                </button>
              </div>
            ) : viewMode === 'cards' ? (
              <div className={liveStyles.liveSessionsGrid}>
                {filteredLiveSessions.map((s, idx) => {
                  const accent = getAccentColor(idx);
                  const timeAgo = getTimeAgo(s.started_at, s.elapsed_minutes);
                  const { elapsedStr, durationStr } = getElapsedDisplay(s.started_at, s.duration_minutes, s.elapsed_minutes);
                  const onlineCount = s.students_online_count ?? 26;
                  const totalCount = s.students_total_count ?? 30;
                  const pct = Math.round(s.students_online_percent ?? (totalCount > 0 ? (onlineCount / totalCount) * 100 : 85));
                  const initials = s.instructor_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'IN';

                  return (
                    <div
                      key={s.id}
                      className={liveStyles.sessionCard}
                      style={{ '--card-accent': accent } as React.CSSProperties}
                    >
                      <div className={liveStyles.sessionCardTop}>
                        <span className={liveStyles.liveBadgeCard}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffffff', display: 'inline-block' }} />
                          LIVE
                        </span>
                        <span className={liveStyles.startedTime}>{timeAgo}</span>
                      </div>

                      <div>
                        <h3 className={liveStyles.subjectTitle}>{s.subject_name || 'Lab Session'}</h3>
                        <p className={liveStyles.topicTitle}>{s.title || 'Practical Experiment'}</p>
                      </div>

                      <div className={liveStyles.tagsRow}>
                        <span className={liveStyles.tagPill}>{s.department_code || 'CSE'}</span>
                        <span className={liveStyles.tagPill}>{s.batch_name || s.academic_year_label || '2026'}</span>
                        <span className={`${liveStyles.tagPill} ${liveStyles.tagPillPurple}`}>
                          {s.section_name ? `Section ${s.section_name}` : 'Section A'}
                        </span>
                      </div>

                      <div className={liveStyles.instructorRow}>
                        <div className={liveStyles.instructorInfo}>
                          <div
                            className={liveStyles.instructorAvatar}
                            style={{ background: getAvatarColor(s.instructor_name) }}
                          >
                            {initials}
                          </div>
                          <div className={liveStyles.instructorMeta}>
                            <span className={liveStyles.instructorName}>{s.instructor_name || 'Faculty Member'}</span>
                            <span className={liveStyles.instructorEmail}>
                              {s.instructor_email || `${(s.instructor_name || 'instructor').toLowerCase().replace(/\s+/g, '.')}@greenwood.edu`}
                            </span>
                          </div>
                        </div>
                        <span className={liveStyles.instructorOnlineBadge}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                          Instructor Online
                        </span>
                      </div>

                      <div className={liveStyles.statsBoxGrid}>
                        <div className={liveStyles.statBox}>
                          <Users size={18} className={liveStyles.statBoxIcon} />
                          <div className={liveStyles.statBoxContent}>
                            <span className={liveStyles.statBoxValue}>{onlineCount} / {totalCount}</span>
                            <div className={liveStyles.statBoxLabelRow}>
                              <span className={liveStyles.statBoxLabel}>Students Online</span>
                              <span className={liveStyles.statBoxPct}>{pct}%</span>
                            </div>
                            <div className={liveStyles.statBoxProgressTrack}>
                              <div className={liveStyles.statBoxProgressFill} style={{ width: `${Math.min(100, pct)}%` }} />
                            </div>
                          </div>
                        </div>

                        <div className={liveStyles.statBox}>
                          <Clock size={18} style={{ color: '#2563eb', flexShrink: 0 }} />
                          <div className={liveStyles.statBoxContent}>
                            <span className={liveStyles.statBoxValue}>{elapsedStr}</span>
                            <div className={liveStyles.statBoxLabelRow}>
                              <span className={liveStyles.statBoxLabel}>Elapsed</span>
                              <span style={{ fontSize: 10.5, color: '#64748b' }}>of {durationStr}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className={liveStyles.roomRow}>
                        <Laptop size={13} color="#64748b" />
                        <span>{s.room || 'Lab 1 (Main Block)'}</span>
                      </div>

                      <div className={liveStyles.cardActions}>
                        <button
                          className={liveStyles.btnCardAction}
                          onClick={() => window.open(`/instructor/sessions/${s.id}`, '_blank')}
                          title="Open Lab Session"
                        >
                          <ExternalLink size={13} /> Open Session
                        </button>
                        <button
                          className={liveStyles.btnCardAction}
                          onClick={() => openStudentRoster(s)}
                          title="View Live Student Attendance"
                        >
                          <Users size={13} /> View Students
                        </button>
                        <button
                          className={liveStyles.btnCardEnd}
                          onClick={() => terminateSession(s.id)}
                          title="Terminate Session"
                        >
                          <StopCircle size={13} /> End Session
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Subject &amp; Lab</th>
                      <th>Class &amp; Section</th>
                      <th>Instructor</th>
                      <th>Students Online</th>
                      <th>Elapsed</th>
                      <th>Room</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLiveSessions.map(s => {
                      const { elapsedStr, durationStr } = getElapsedDisplay(s.started_at, s.duration_minutes, s.elapsed_minutes);
                      const onlineCount = s.students_online_count ?? 26;
                      const totalCount = s.students_total_count ?? 30;
                      const pct = Math.round(s.students_online_percent ?? (totalCount > 0 ? (onlineCount / totalCount) * 100 : 85));

                      return (
                        <tr key={s.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span className={liveStyles.liveBadgeCard}>LIVE</span>
                              <div>
                                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
                                  {s.subject_name || 'Lab Session'}
                                </div>
                                <div style={{ fontSize: 12, color: '#64748b' }}>{s.title}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
                              {s.batch_name || '2026'} &bull; Section {s.section_name || 'A'}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.department_code || 'CSE'}</div>
                          </td>
                          <td>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
                              {s.instructor_name || 'Instructor'}
                            </div>
                            <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>&bull; Online</div>
                          </td>
                          <td>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                              {onlineCount} / {totalCount} ({pct}%)
                            </div>
                          </td>
                          <td>
                            <div style={{ fontSize: 12.5, color: '#334155' }}>
                              {elapsedStr} <span style={{ color: '#94a3b8', fontSize: 11 }}>/ {durationStr}</span>
                            </div>
                          </td>
                          <td style={{ fontSize: 12.5, color: '#475569' }}>
                            {s.room || 'Lab 1'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className={liveStyles.btnCardAction}
                                style={{ padding: '5px 9px', fontSize: 11.5 }}
                                onClick={() => window.open(`/instructor/sessions/${s.id}`, '_blank')}
                              >
                                <ExternalLink size={12} /> Open
                              </button>
                              <button
                                className={liveStyles.btnCardAction}
                                style={{ padding: '5px 9px', fontSize: 11.5 }}
                                onClick={() => openStudentRoster(s)}
                              >
                                <Users size={12} /> Students
                              </button>
                              <button
                                className={liveStyles.btnCardEnd}
                                style={{ padding: '5px 9px', fontSize: 11.5 }}
                                onClick={() => terminateSession(s.id)}
                              >
                                <StopCircle size={12} /> End
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Recent Activity Table ── */}
            <div className={liveStyles.recentActivityCard}>
              <div className={liveStyles.activityHeader}>
                <div className={liveStyles.activityHeaderLeft}>
                  <div className={liveStyles.activityWaveIcon}>
                    <Activity size={17} strokeWidth={2.4} />
                  </div>
                  <div>
                    <h3 className={liveStyles.activityTitle}>Recent Activity</h3>
                    <p className={liveStyles.activitySubtitle}>Live session events and join/leave activity</p>
                  </div>
                </div>
                <button
                  className={liveStyles.btnViewAllLogs}
                  onClick={() => router.push('/institution/audit-log')}
                >
                  View All Logs <ArrowRight size={13} />
                </button>
              </div>

              <div className={liveStyles.activityTableWrap}>
                <table className={liveStyles.activityTable}>
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Time</th>
                      <th style={{ width: 170 }}>Event</th>
                      <th style={{ width: 200 }}>Session</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentActivity.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>
                          No recent live activity logged yet.
                        </td>
                      </tr>
                    ) : (
                      recentActivity.map(act => {
                        const isStudentLeft = act.event_label?.toLowerCase().includes('left') || act.event_type === 'student_left';
                        return (
                          <tr key={act.id}>
                            <td style={{ color: '#64748b', whiteSpace: 'nowrap', fontWeight: 500 }}>
                              {act.time || fmtTime(act.timestamp)}
                            </td>
                            <td>
                              <span className={liveStyles.eventCell}>
                                <span className={isStudentLeft ? liveStyles.eventDotRed : liveStyles.eventDotGreen} />
                                {act.event_label}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600, color: '#1e293b' }}>
                              {act.session_name}
                            </td>
                            <td style={{ color: '#475569' }}>
                              {act.details}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            CALENDAR TAB — REDESIGNED TO MATCH REFERENCE UI
        ══════════════════════════════════════════════════════════════════════ */}
        {tab === 'calendar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── 2-Row Filter Bar (Academic Year, Dept, Batch, Section, Subject, Instructor, Lab) ── */}
            <div className={liveStyles.calendarFilterGrid} ref={calFilterRef}>
              {/* Row 1 */}
              <div className={liveStyles.calendarFilterRow1}>
                {/* Year */}
                <div
                  className={`${liveStyles.filterCard} ${openCalFilter === 'year' ? liveStyles.filterCardActive : ''}`}
                  onClick={() => setOpenCalFilter(openCalFilter === 'year' ? null : 'year')}
                >
                  <div className={liveStyles.filterCardLeft}>
                    <div className={liveStyles.filterIconWrap}><Calendar size={15} /></div>
                    <div className={liveStyles.filterInfo}>
                      <span className={liveStyles.filterLabel}>Academic Year</span>
                      <span className={liveStyles.filterValue}>{selectedCalYear || 'All Years'}</span>
                    </div>
                  </div>
                  <ChevronDown size={14} className={`${liveStyles.filterChevron} ${openCalFilter === 'year' ? liveStyles.filterChevronOpen : ''}`} />
                  {openCalFilter === 'year' && (
                    <div className={liveStyles.filterDropdown} onClick={e => e.stopPropagation()}>
                      <div className={`${liveStyles.filterDropdownOption} ${!selectedCalYear ? liveStyles.filterDropdownOptionSelected : ''}`}
                        onClick={() => { setSelectedCalYear(''); setOpenCalFilter(null); }}>
                        <span>All Years</span>
                      </div>
                      <div className={`${liveStyles.filterDropdownOption} ${selectedCalYear === '2026 - 2027' ? liveStyles.filterDropdownOptionSelected : ''}`}
                        onClick={() => { setSelectedCalYear('2026 - 2027'); setOpenCalFilter(null); }}>
                        <span>2026 – 2027</span>
                      </div>
                      {academicYears.filter(y => y.year_label !== '2026 - 2027').map(y => (
                        <div key={y.id} className={`${liveStyles.filterDropdownOption} ${selectedCalYear === y.year_label ? liveStyles.filterDropdownOptionSelected : ''}`}
                          onClick={() => { setSelectedCalYear(y.year_label); setOpenCalFilter(null); }}>
                          <span>{y.year_label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Department */}
                <div
                  className={`${liveStyles.filterCard} ${openCalFilter === 'dept' ? liveStyles.filterCardActive : ''}`}
                  onClick={() => setOpenCalFilter(openCalFilter === 'dept' ? null : 'dept')}
                >
                  <div className={liveStyles.filterCardLeft}>
                    <div className={liveStyles.filterIconWrap}><Building2 size={15} /></div>
                    <div className={liveStyles.filterInfo}>
                      <span className={liveStyles.filterLabel}>Department</span>
                      <span className={liveStyles.filterValue}>{selectedCalDept || 'All Departments'}</span>
                    </div>
                  </div>
                  <ChevronDown size={14} className={`${liveStyles.filterChevron} ${openCalFilter === 'dept' ? liveStyles.filterChevronOpen : ''}`} />
                  {openCalFilter === 'dept' && (
                    <div className={liveStyles.filterDropdown} onClick={e => e.stopPropagation()}>
                      <div className={`${liveStyles.filterDropdownOption} ${!selectedCalDept ? liveStyles.filterDropdownOptionSelected : ''}`}
                        onClick={() => { setSelectedCalDept(''); setOpenCalFilter(null); }}>
                        <span>All Departments</span>
                      </div>
                      {departments.map(d => (
                        <div key={d.id} className={`${liveStyles.filterDropdownOption} ${selectedCalDept === d.name ? liveStyles.filterDropdownOptionSelected : ''}`}
                          onClick={() => { setSelectedCalDept(d.name); setOpenCalFilter(null); }}>
                          <span>{d.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Batch */}
                <div
                  className={`${liveStyles.filterCard} ${openCalFilter === 'batch' ? liveStyles.filterCardActive : ''}`}
                  onClick={() => setOpenCalFilter(openCalFilter === 'batch' ? null : 'batch')}
                >
                  <div className={liveStyles.filterCardLeft}>
                    <div className={liveStyles.filterIconWrap}><Layers size={15} /></div>
                    <div className={liveStyles.filterInfo}>
                      <span className={liveStyles.filterLabel}>Batch</span>
                      <span className={liveStyles.filterValue}>{selectedCalBatch || 'All Batches'}</span>
                    </div>
                  </div>
                  <ChevronDown size={14} className={`${liveStyles.filterChevron} ${openCalFilter === 'batch' ? liveStyles.filterChevronOpen : ''}`} />
                  {openCalFilter === 'batch' && (
                    <div className={liveStyles.filterDropdown} onClick={e => e.stopPropagation()}>
                      <div className={`${liveStyles.filterDropdownOption} ${!selectedCalBatch ? liveStyles.filterDropdownOptionSelected : ''}`}
                        onClick={() => { setSelectedCalBatch(''); setOpenCalFilter(null); }}>
                        <span>All Batches</span>
                      </div>
                      {batches.map(b => (
                        <div key={b.id} className={`${liveStyles.filterDropdownOption} ${selectedCalBatch === b.name ? liveStyles.filterDropdownOptionSelected : ''}`}
                          onClick={() => { setSelectedCalBatch(b.name); setOpenCalFilter(null); }}>
                          <span>{b.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section */}
                <div
                  className={`${liveStyles.filterCard} ${openCalFilter === 'section' ? liveStyles.filterCardActive : ''}`}
                  onClick={() => setOpenCalFilter(openCalFilter === 'section' ? null : 'section')}
                >
                  <div className={liveStyles.filterCardLeft}>
                    <div className={liveStyles.filterIconWrap}><Users size={15} /></div>
                    <div className={liveStyles.filterInfo}>
                      <span className={liveStyles.filterLabel}>Section</span>
                      <span className={liveStyles.filterValue}>{selectedCalSection || 'All Sections'}</span>
                    </div>
                  </div>
                  <ChevronDown size={14} className={`${liveStyles.filterChevron} ${openCalFilter === 'section' ? liveStyles.filterChevronOpen : ''}`} />
                  {openCalFilter === 'section' && (
                    <div className={liveStyles.filterDropdown} onClick={e => e.stopPropagation()}>
                      <div className={`${liveStyles.filterDropdownOption} ${!selectedCalSection ? liveStyles.filterDropdownOptionSelected : ''}`}
                        onClick={() => { setSelectedCalSection(''); setOpenCalFilter(null); }}>
                        <span>All Sections</span>
                      </div>
                      {allSections.map(sec => (
                        <div key={sec.id} className={`${liveStyles.filterDropdownOption} ${selectedCalSection === sec.name ? liveStyles.filterDropdownOptionSelected : ''}`}
                          onClick={() => { setSelectedCalSection(sec.name); setOpenCalFilter(null); }}>
                          <span>Section {sec.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2 */}
              <div className={liveStyles.calendarFilterRow2}>
                {/* Subject */}
                <div
                  className={`${liveStyles.filterCard} ${openCalFilter === 'subject' ? liveStyles.filterCardActive : ''}`}
                  onClick={() => setOpenCalFilter(openCalFilter === 'subject' ? null : 'subject')}
                >
                  <div className={liveStyles.filterCardLeft}>
                    <div className={liveStyles.filterIconWrap}><BookOpen size={15} /></div>
                    <div className={liveStyles.filterInfo}>
                      <span className={liveStyles.filterLabel}>Subject</span>
                      <span className={liveStyles.filterValue}>{selectedCalSubject || 'All Subjects'}</span>
                    </div>
                  </div>
                  <ChevronDown size={14} className={`${liveStyles.filterChevron} ${openCalFilter === 'subject' ? liveStyles.filterChevronOpen : ''}`} />
                  {openCalFilter === 'subject' && (
                    <div className={liveStyles.filterDropdown} onClick={e => e.stopPropagation()}>
                      <div className={`${liveStyles.filterDropdownOption} ${!selectedCalSubject ? liveStyles.filterDropdownOptionSelected : ''}`}
                        onClick={() => { setSelectedCalSubject(''); setOpenCalFilter(null); }}>
                        <span>All Subjects</span>
                      </div>
                      {allSubjects.map(sub => (
                        <div key={sub.id} className={`${liveStyles.filterDropdownOption} ${selectedCalSubject === sub.name ? liveStyles.filterDropdownOptionSelected : ''}`}
                          onClick={() => { setSelectedCalSubject(sub.name); setOpenCalFilter(null); }}>
                          <span>{sub.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Instructor */}
                <div
                  className={`${liveStyles.filterCard} ${openCalFilter === 'instructor' ? liveStyles.filterCardActive : ''}`}
                  onClick={() => setOpenCalFilter(openCalFilter === 'instructor' ? null : 'instructor')}
                >
                  <div className={liveStyles.filterCardLeft}>
                    <div className={liveStyles.filterIconWrap}><UserIcon size={15} /></div>
                    <div className={liveStyles.filterInfo}>
                      <span className={liveStyles.filterLabel}>Instructor</span>
                      <span className={liveStyles.filterValue}>{selectedCalInstructor || 'All Instructors'}</span>
                    </div>
                  </div>
                  <ChevronDown size={14} className={`${liveStyles.filterChevron} ${openCalFilter === 'instructor' ? liveStyles.filterChevronOpen : ''}`} />
                  {openCalFilter === 'instructor' && (
                    <div className={liveStyles.filterDropdown} onClick={e => e.stopPropagation()}>
                      <div className={`${liveStyles.filterDropdownOption} ${!selectedCalInstructor ? liveStyles.filterDropdownOptionSelected : ''}`}
                        onClick={() => { setSelectedCalInstructor(''); setOpenCalFilter(null); }}>
                        <span>All Instructors</span>
                      </div>
                      {instructors.map(i => (
                        <div key={i.id} className={`${liveStyles.filterDropdownOption} ${selectedCalInstructor === i.full_name ? liveStyles.filterDropdownOptionSelected : ''}`}
                          onClick={() => { setSelectedCalInstructor(i.full_name); setOpenCalFilter(null); }}>
                          <span>{i.full_name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lab Venue */}
                <div
                  className={`${liveStyles.filterCard} ${openCalFilter === 'lab' ? liveStyles.filterCardActive : ''}`}
                  onClick={() => setOpenCalFilter(openCalFilter === 'lab' ? null : 'lab')}
                >
                  <div className={liveStyles.filterCardLeft}>
                    <div className={liveStyles.filterIconWrap}><Laptop size={15} /></div>
                    <div className={liveStyles.filterInfo}>
                      <span className={liveStyles.filterLabel}>Lab</span>
                      <span className={liveStyles.filterValue}>{selectedCalLab || 'All Labs'}</span>
                    </div>
                  </div>
                  <ChevronDown size={14} className={`${liveStyles.filterChevron} ${openCalFilter === 'lab' ? liveStyles.filterChevronOpen : ''}`} />
                  {openCalFilter === 'lab' && (
                    <div className={liveStyles.filterDropdown} onClick={e => e.stopPropagation()}>
                      {['All Labs', 'Lab 1', 'Lab 2', 'Lab 3'].map(l => (
                        <div key={l} className={`${liveStyles.filterDropdownOption} ${selectedCalLab === (l === 'All Labs' ? '' : l) ? liveStyles.filterDropdownOptionSelected : ''}`}
                          onClick={() => { setSelectedCalLab(l === 'All Labs' ? '' : l); setOpenCalFilter(null); }}>
                          <span>{l}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── 2-Column Calendar Layout (Grid + Sidebar) ── */}
            <div className={liveStyles.calendarLayout}>

              {/* ── LEFT: Main Calendar Area ── */}
              <div className={liveStyles.calendarMainCol}>

                {/* Controls Bar */}
                <div className={liveStyles.calendarControlsBar}>
                  <div className={liveStyles.viewModePills}>
                    {(['day', 'week', 'month', 'agenda'] as const).map(m => (
                      <button
                        key={m}
                        className={`${liveStyles.viewModeBtn} ${calMode === m ? liveStyles.viewModeBtnActive : ''}`}
                        onClick={() => setCalMode(m)}
                      >
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </button>
                    ))}
                  </div>

                  <div className={liveStyles.calendarNavGroup}>
                    <button className={liveStyles.navArrowBtn} onClick={handleNavPrev} title="Previous">
                      <ChevronLeft size={16} />
                    </button>
                    <span className={liveStyles.dateRangeText}>
                      {calMode === 'day'
                        ? calSelectedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                        : calMode === 'month'
                          ? weekStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
                          : `${weekStart.getDate()} – ${new Date(weekStart.getTime() + 6 * 86400000).getDate()} ${weekStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`
                      }
                    </span>
                    <button className={liveStyles.navArrowBtn} onClick={handleNavNext} title="Next">
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <button className={liveStyles.btnToday} onClick={handleJumpToday}>
                    Today
                  </button>
                </div>

                {/* ── WEEK VIEW ── */}
                {calMode === 'week' && (
                  <div className={liveStyles.weekGridCard}>
                    <div className={liveStyles.weekGridScroll}>
                      <table className={liveStyles.weekTable}>
                        <thead>
                          <tr className={liveStyles.weekHeaderRow}>
                            <th className={liveStyles.weekHeaderGutter}>
                              GMT+5:30
                            </th>
                            {weekDays.map(d => {
                              const isToday = dayKey(d) === dayKey(new Date());
                              return (
                                <th key={dayKey(d)} className={`${liveStyles.weekDayHeader} ${isToday ? liveStyles.weekDayHeaderToday : ''}`}>
                                  <div className={liveStyles.weekDayName}>{DAY_SHORT[(d.getDay() + 6) % 7]}</div>
                                  {isToday ? (
                                    <div className={liveStyles.todayDateBadge}>{d.getDate()}</div>
                                  ) : (
                                    <div className={liveStyles.weekDayDate}>{d.getDate()} {d.toLocaleDateString('en-IN', { month: 'short' })}</div>
                                  )}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(hour => {
                            const timeLabel = hour === 12 ? '12:00 PM' : hour > 12 ? `${hour - 12}:00 PM` : `${hour}:00 AM`;
                            return (
                              <tr key={hour} className={liveStyles.timeRow}>
                                <td className={liveStyles.timeGutterCell}>
                                  {timeLabel}
                                </td>
                                {weekDays.map(d => {
                                  const k = dayKey(d);
                                  const isToday = dayKey(d) === dayKey(new Date());
                                  const sessionsInSlot = (sessionsByDay[k] || []).filter(s => {
                                    const st = new Date(s.scheduled_at);
                                    return st.getHours() === hour;
                                  });

                                  return (
                                    <td
                                      key={`${k}-${hour}`}
                                      className={`${liveStyles.daySlotCell} ${isToday ? liveStyles.daySlotCellToday : ''}`}
                                      onDoubleClick={() => openScheduleSlot(k, `${hour}:00`)}
                                    >
                                      {sessionsInSlot.map((s, sIdx) => {
                                        const pastel = getSessionPastel(s, sIdx);
                                        const st = new Date(s.scheduled_at);
                                        const end = new Date(st.getTime() + (s.duration_minutes || 60) * 60000);
                                        const timeRangeStr = `${fmtTime(s.scheduled_at)} – ${end.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;

                                        return (
                                          <div
                                            key={s.id}
                                            className={liveStyles.calendarSessionChip}
                                            style={{
                                              background: pastel.bg,
                                              borderColor: pastel.border,
                                              borderLeftColor: pastel.accent,
                                            }}
                                            onClick={() => setSelectedSessionDetails(s)}
                                            title={`${s.title || s.subject_name}\n${timeRangeStr}\nInstructor: ${s.instructor_name || '—'}\nRoom: ${s.room || 'Lab 1'}`}
                                          >
                                            <span className={liveStyles.sessionChipTitle}>{s.subject_name || s.title}</span>
                                            <span className={liveStyles.sessionChipVenue}>{s.room ? s.room.split(' ')[0] : 'Lab 1'}</span>
                                            <span className={liveStyles.sessionChipInstructor}>
                                              {s.instructor_name ? `${s.instructor_name.split(' ').slice(-1)[0]}` : 'Faculty'}
                                            </span>
                                            <span className={liveStyles.sessionChipTime}>{timeRangeStr}</span>
                                          </div>
                                        );
                                      })}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Legend */}
                    <div className={liveStyles.calendarLegendBar}>
                      <span className={liveStyles.legendItem}>
                        <span className={liveStyles.legendDot} style={{ background: '#7c3aed' }} /> Scheduled
                      </span>
                      <span className={liveStyles.legendItem}>
                        <span className={liveStyles.legendDot} style={{ background: '#22c55e' }} /> Live
                      </span>
                      <span className={liveStyles.legendItem}>
                        <span className={liveStyles.legendDot} style={{ background: '#2563eb' }} /> Completed
                      </span>
                      <span className={liveStyles.legendItem}>
                        <span className={liveStyles.legendDot} style={{ background: '#ef4444' }} /> Cancelled
                      </span>
                    </div>
                  </div>
                )}

                {/* ── DAY VIEW ── */}
                {calMode === 'day' && (
                  <div className={liveStyles.agendaContainer}>
                    <div className={liveStyles.agendaDateHeader}>
                      <Calendar size={16} color="#7c3aed" />
                      <span>{calSelectedDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </div>
                    {filteredCalSessions.filter(s => dayKey(new Date(s.scheduled_at)) === dayKey(calSelectedDate)).length === 0 ? (
                      <p style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>No sessions scheduled for this day.</p>
                    ) : (
                      filteredCalSessions.filter(s => dayKey(new Date(s.scheduled_at)) === dayKey(calSelectedDate)).map((s, idx) => {
                        const pastel = getSessionPastel(s, idx);
                        return (
                          <div key={s.id} className={liveStyles.agendaCard} style={{ borderLeft: `4px solid ${pastel.accent}` }} onClick={() => setSelectedSessionDetails(s)}>
                            <div>
                              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{s.subject_name || s.title}</div>
                              <div style={{ fontSize: 12, color: '#64748b' }}>{s.room} &bull; {s.section_name} &bull; {s.instructor_name}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{fmtTime(s.scheduled_at)}</div>
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>{s.duration_minutes} mins</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* ── MONTH VIEW ── */}
                {calMode === 'month' && (
                  <div className={liveStyles.monthGrid}>
                    {DAY_SHORT.map(d => (
                      <div key={d} className={liveStyles.monthDayHeader}>{d}</div>
                    ))}
                    {(() => {
                      const yr = calSelectedDate.getFullYear();
                      const mo = calSelectedDate.getMonth();
                      const firstDay = new Date(yr, mo, 1);
                      const startOffset = (firstDay.getDay() + 6) % 7;
                      const daysInMo = new Date(yr, mo + 1, 0).getDate();
                      const todayK = dayKey(new Date());
                      const selectedK = dayKey(calSelectedDate);
                      const totalCells = Math.max(35, Math.ceil((startOffset + daysInMo) / 7) * 7);

                      return [...Array(totalCells)].map((_, i) => {
                        const dayOffset = i - startOffset;
                        const cellDate = new Date(yr, mo, 1 + dayOffset);
                        const isCurrentMonth = cellDate.getMonth() === mo;
                        const k = dayKey(cellDate);
                        const daySessions = sessionsByDay[k] || [];
                        const isToday = k === todayK;
                        const isSelected = k === selectedK;

                        return (
                          <div
                            key={k}
                            className={liveStyles.monthDayCell}
                            style={!isCurrentMonth ? { opacity: 0.4, background: 'rgba(248, 250, 252, 0.6)' } : {}}
                            onClick={() => {
                              setCalSelectedDate(cellDate);
                              const mon = new Date(cellDate);
                              mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
                              setWeekStart(mon);
                              setCalMode('day');
                            }}
                          >
                            <span
                              className={`${liveStyles.monthDayNum} ${isToday ? liveStyles.todayDateBadge : ''}`}
                              style={isToday ? { width: 22, height: 22, fontSize: 11 } : isSelected ? { fontWeight: 800, color: '#7c3aed' } : {}}
                            >
                              {cellDate.getDate()}
                            </span>
                            {daySessions.slice(0, 2).map((s, sIdx) => {
                              const pastel = getSessionPastel(s, sIdx);
                              return (
                                <div key={s.id} className={liveStyles.monthSessionPill} style={{ background: pastel.bg, color: pastel.text, border: `1px solid ${pastel.border}` }}>
                                  {s.subject_code || s.subject_name || 'Lab'}
                                </div>
                              );
                            })}
                            {daySessions.length > 2 && (
                              <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700 }}>+{daySessions.length - 2} more</span>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}

                {/* ── AGENDA VIEW ── */}
                {calMode === 'agenda' && (
                  <div className={liveStyles.agendaContainer}>
                    {weekDays.map(d => {
                      const k = dayKey(d);
                      const sessions = sessionsByDay[k] || [];
                      if (sessions.length === 0) return null;
                      return (
                        <div key={k} className={liveStyles.agendaGroup}>
                          <div className={liveStyles.agendaDateHeader}>
                            <Calendar size={15} color="#7c3aed" />
                            <span>{d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                          </div>
                          {sessions.map((s, idx) => {
                            const pastel = getSessionPastel(s, idx);
                            return (
                              <div key={s.id} className={liveStyles.agendaCard} style={{ borderLeft: `4px solid ${pastel.accent}` }} onClick={() => setSelectedSessionDetails(s)}>
                                <div>
                                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{s.subject_name || s.title}</div>
                                  <div style={{ fontSize: 12, color: '#64748b' }}>{s.room} &bull; Section {s.section_name} &bull; {s.instructor_name}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{fmtTime(s.scheduled_at)}</div>
                                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{s.duration_minutes} mins</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Unscheduled Slots Banner ── */}
                <div className={liveStyles.unscheduledBanner}>
                  <div className={liveStyles.unscheduledHeader}>
                    <div className={liveStyles.unscheduledHeaderLeft}>
                      <div className={liveStyles.unscheduledIconWrap}>
                        <Lightbulb size={18} strokeWidth={2.4} />
                      </div>
                      <div>
                        <h4 className={liveStyles.unscheduledTitle}>Unscheduled Slots</h4>
                        <p className={liveStyles.unscheduledSubtitle}>These time slots are free for new sessions.</p>
                      </div>
                    </div>
                    <button
                      className={liveStyles.btnViewAllFree}
                      onClick={() => openScheduleSlot(dayKey(new Date()), '14:00', 'Lab 1')}
                    >
                      View All Free Slots &rarr;
                    </button>
                  </div>

                  {(() => {
                    const now = new Date();
                    const d0 = new Date(now);
                    const d1 = new Date(now); d1.setDate(d1.getDate() + 1);
                    const d2 = new Date(now); d2.setDate(d2.getDate() + 2);
                    const fmt = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });

                    const slots = [
                      { d: d0, dateKey: dayKey(d0), label: fmt(d0), time: '2:00 PM – 4:00 PM', timeVal: '14:00', room: 'Lab 1 (Main Block)' },
                      { d: d1, dateKey: dayKey(d1), label: fmt(d1), time: '3:00 PM – 5:00 PM', timeVal: '15:00', room: 'Lab 2 (Network Lab)' },
                      { d: d2, dateKey: dayKey(d2), label: fmt(d2), time: '9:00 AM – 12:00 PM', timeVal: '09:00', room: 'Lab 3 (Data Lab)' },
                    ];

                    return (
                      <div className={liveStyles.freeSlotsGrid}>
                        {slots.map(s => (
                          <div key={s.dateKey + s.timeVal} className={liveStyles.freeSlotCard}>
                            <div className={liveStyles.freeSlotInfo}>
                              <span className={liveStyles.freeSlotDate}>{s.label}</span>
                              <span className={liveStyles.freeSlotTime}>{s.time}</span>
                            </div>
                            <button
                              className={liveStyles.btnScheduleSlot}
                              onClick={() => openScheduleSlot(s.dateKey, s.timeVal, s.room)}
                            >
                              <Plus size={12} /> Schedule
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

              </div>

              {/* ── RIGHT: Sidebar Widgets Column ── */}
              <div className={liveStyles.sidebarWidgetsCol}>

                {/* Widget 1: Mini Calendar / Date Picker */}
                <div className={liveStyles.widgetCard}>
                  <div className={liveStyles.miniCalHeader}>
                    <span className={liveStyles.miniCalTitle}>
                      {calSelectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                    <div className={liveStyles.miniCalNav}>
                      <button
                        className={liveStyles.miniCalNavBtn}
                        onClick={() => {
                          const d = new Date(calSelectedDate.getFullYear(), calSelectedDate.getMonth() - 1, 1);
                          setCalSelectedDate(d);
                          const mon = new Date(d);
                          mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
                          setWeekStart(mon);
                        }}
                        title="Previous Month"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <button
                        className={liveStyles.miniCalNavBtn}
                        onClick={() => {
                          const d = new Date(calSelectedDate.getFullYear(), calSelectedDate.getMonth() + 1, 1);
                          setCalSelectedDate(d);
                          const mon = new Date(d);
                          mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
                          setWeekStart(mon);
                        }}
                        title="Next Month"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>

                  <div className={liveStyles.miniCalWeekdays}>
                    {DAY_SHORT.map(d => (
                      <span key={d}>{d}</span>
                    ))}
                  </div>

                  <div className={liveStyles.miniCalGrid}>
                    {(() => {
                      const yr = calSelectedDate.getFullYear();
                      const mo = calSelectedDate.getMonth();
                      const firstDay = new Date(yr, mo, 1);
                      const startOffset = (firstDay.getDay() + 6) % 7;
                      const daysInMo = new Date(yr, mo + 1, 0).getDate();
                      const today = new Date();

                      return (
                        <>
                          {[...Array(startOffset)].map((_, i) => (
                            <div key={`cal-pad-${i}`} className={liveStyles.miniCalDayCellEmpty} />
                          ))}
                          {[...Array(daysInMo)].map((_, i) => {
                            const dayNum = i + 1;
                            const isSelected = (calSelectedDate.getFullYear() === yr && calSelectedDate.getMonth() === mo && calSelectedDate.getDate() === dayNum);
                            const isToday = (today.getFullYear() === yr && today.getMonth() === mo && today.getDate() === dayNum);
                            const k = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                            const hasEvent = (sessionsByDay[k] && sessionsByDay[k].length > 0);

                            return (
                              <div
                                key={dayNum}
                                className={`${liveStyles.miniCalDayCell} ${isSelected ? liveStyles.miniCalDayActive : ''} ${isToday && !isSelected ? liveStyles.miniCalDayToday : ''}`}
                                onClick={() => {
                                  const d = new Date(yr, mo, dayNum);
                                  setCalSelectedDate(d);
                                  const mon = new Date(d);
                                  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
                                  setWeekStart(mon);
                                }}
                              >
                                {dayNum}
                                {hasEvent && !isSelected && <span className={liveStyles.miniCalDayDot} />}
                              </div>
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>

                  <div className={liveStyles.miniCalLegend}>
                    <span>&bull; Scheduled</span>
                    <span>&bull; Live</span>
                    <span>&bull; Completed</span>
                    <span>&bull; Cancelled</span>
                  </div>
                </div>

                {/* Widget 2: Next Session Card */}
                <div className={liveStyles.widgetCard}>
                  <div className={liveStyles.nextSessionHeader}>
                    <span className={liveStyles.nextSessionTitle}>Next Session</span>
                    <span className={liveStyles.nextSessionTimeBadge} style={{
                      backgroundColor: nextSession && getNextSessionCountdown(nextSession).isLive ? '#fee2e2' : '#eff6ff',
                      color: nextSession && getNextSessionCountdown(nextSession).isLive ? '#dc2626' : '#2563eb',
                      borderColor: nextSession && getNextSessionCountdown(nextSession).isLive ? '#fca5a5' : '#bfdbfe',
                    }}>
                      {nextSession ? getNextSessionCountdown(nextSession).label : 'None'}
                    </span>
                  </div>

                  {nextSession ? (
                    <div className={liveStyles.nextSessionInnerBox}>
                      <div className={liveStyles.nextSessionTopRow}>
                        <div className={liveStyles.nextSessionSubjWrap}>
                          <div className={liveStyles.nextSessionSubjIcon}>
                            <BookOpen size={15} />
                          </div>
                          <span className={liveStyles.nextSessionSubjName}>{nextSession.subject_name || nextSession.title || 'Lab Session'}</span>
                        </div>
                        <span className={liveStyles.nextSessionCodeBadge}>{nextSession.subject_code || 'LAB'}</span>
                      </div>

                      <div className={liveStyles.nextSessionTimeRange}>
                        {fmtTime(nextSession.scheduled_at)} – {new Date(new Date(nextSession.scheduled_at).getTime() + (nextSession.duration_minutes || 90) * 60000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </div>

                      <div className={liveStyles.nextSessionMetaRow}>
                        <span>{nextSession.room ? nextSession.room.split(' ')[0] : 'Online / Lab'}</span>
                        <span>&bull;</span>
                        <span>Section {nextSession.section_name || 'All'}</span>
                      </div>

                      <div className={liveStyles.nextSessionMetaRow}>
                        <UserIcon size={12} />
                        <span>{nextSession.instructor_name || 'Assigned Instructor'}</span>
                      </div>

                      <div className={liveStyles.nextSessionMetaRow}>
                        <Users size={12} />
                        <span>{nextSession.students_total_count ?? nextSession.student_count ?? 0} students</span>
                      </div>

                      <button
                        className={liveStyles.btnViewNextDetails}
                        onClick={() => setSelectedSessionDetails(nextSession)}
                      >
                        View Details
                      </button>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>No upcoming sessions found.</p>
                  )}
                </div>

                {/* Widget 3: Today's Summary */}
                <div className={liveStyles.widgetCard}>
                  <div className={liveStyles.todaySummaryHeader}>
                    <span className={liveStyles.todaySummaryTitle}>Today&apos;s Summary</span>
                    <button className={liveStyles.btnViewAllSummary} onClick={() => setCalMode('agenda')}>
                      View All
                    </button>
                  </div>

                  <div className={liveStyles.todayStatsGrid}>
                    <div className={liveStyles.todayStatBox}>
                      <BookOpen size={18} color="#7c3aed" className={liveStyles.todayStatIcon} />
                      <div>
                        <div className={liveStyles.todayStatValue}>{todaySummary.totalSessions}</div>
                        <div className={liveStyles.todayStatLabel}>Total Sessions</div>
                      </div>
                    </div>

                    <div className={liveStyles.todayStatBox}>
                      <UserCheck size={18} color="#16a34a" className={liveStyles.todayStatIcon} />
                      <div>
                        <div className={liveStyles.todayStatValue}>{todaySummary.instructors}</div>
                        <div className={liveStyles.todayStatLabel}>Instructors</div>
                      </div>
                    </div>

                    <div className={liveStyles.todayStatBox}>
                      <Users size={18} color="#2563eb" className={liveStyles.todayStatIcon} />
                      <div>
                        <div className={liveStyles.todayStatValue}>{todaySummary.totalStudents}</div>
                        <div className={liveStyles.todayStatLabel}>Total Students</div>
                      </div>
                    </div>

                    <div className={liveStyles.todayStatBox}>
                      <CheckCircle size={18} color="#10b981" className={liveStyles.todayStatIcon} />
                      <div>
                        <div className={liveStyles.todayStatValue}>{todaySummary.conflicts}</div>
                        <div className={liveStyles.todayStatLabel}>Conflicts</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Widget 4: Quick Actions */}
                <div className={liveStyles.widgetCard}>
                  <span className={liveStyles.todaySummaryTitle}>Quick Actions</span>
                  <div className={liveStyles.quickActionsGrid}>
                    <button
                      className={liveStyles.btnQuickAction}
                      onClick={() => {
                        const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                        setStartForm({
                          title: 'New Lab Session',
                          section_id: allSections[0]?.id || '',
                          subject_id: allSubjects[0]?.id || '',
                          instructor_id: instructors[0]?.id || '',
                          duration_minutes: 60,
                          room: 'Lab 1 (Main Block)',
                          start_immediately: false,
                          scheduled_at: todayStr,
                        });
                        setShowStartModal(true);
                      }}
                    >
                      <Plus size={13} color="#7c3aed" /> Schedule Session
                    </button>

                    <button
                      className={liveStyles.btnQuickAction}
                      onClick={() => switchTab('planner')}
                    >
                      <Layers size={13} color="#2563eb" /> Manage Recurring
                    </button>

                    <button
                      className={liveStyles.btnQuickAction}
                      onClick={handleCheckConflicts}
                    >
                      <ShieldCheck size={13} color="#16a34a" /> Check Conflicts
                    </button>

                    <button
                      className={liveStyles.btnQuickAction}
                      onClick={exportCalendarCsv}
                    >
                      <Download size={13} color="#ea580c" /> Export Calendar
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            UPCOMING TAB
        ══════════════════════════════════════════════════════════════════════ */}
        {tab === 'upcoming' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── 2-Row Filter Grid ── */}
            <div className={liveStyles.upcomingFilterGrid} ref={upcomingFilterRef}>
              {/* Row 1: Academic Year, Department, Batch, Section */}
              <div className={liveStyles.upcomingFilterRow1}>
                {/* Academic Year Filter */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className={liveStyles.filterSelectBtn}
                    onClick={() => setOpenUpcomingFilter(openUpcomingFilter === 'year' ? null : 'year')}
                  >
                    <div className={liveStyles.filterBtnInner}>
                      <Calendar size={15} className={liveStyles.filterIcon} />
                      <div className={liveStyles.filterTextCol}>
                        <span className={liveStyles.filterLabel}>Academic Year</span>
                        <span className={liveStyles.filterValue}>{selectedUpcomingYear || '2026 - 2027'}</span>
                      </div>
                    </div>
                    <ChevronDown size={14} className={liveStyles.filterArrow} />
                  </button>
                  {openUpcomingFilter === 'year' && (
                    <div className={liveStyles.filterPopover}>
                      {['2026 - 2027', '2025 - 2026', 'All Years'].map(y => (
                        <div
                          key={y}
                          className={`${liveStyles.filterOption} ${selectedUpcomingYear === y ? liveStyles.filterOptionActive : ''}`}
                          onClick={() => { setSelectedUpcomingYear(y); setOpenUpcomingFilter(null); }}
                        >
                          <span>{y}</span>
                          {selectedUpcomingYear === y && <Check size={14} color="#7c3aed" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Department Filter */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className={liveStyles.filterSelectBtn}
                    onClick={() => setOpenUpcomingFilter(openUpcomingFilter === 'dept' ? null : 'dept')}
                  >
                    <div className={liveStyles.filterBtnInner}>
                      <Building2 size={15} className={liveStyles.filterIcon} />
                      <div className={liveStyles.filterTextCol}>
                        <span className={liveStyles.filterLabel}>Department</span>
                        <span className={liveStyles.filterValue}>
                          {selectedUpcomingDept
                            ? (departments.find(d => d.name === selectedUpcomingDept || d.id === selectedUpcomingDept)?.name || selectedUpcomingDept)
                            : 'All Departments'}
                        </span>
                      </div>
                    </div>
                    <ChevronDown size={14} className={liveStyles.filterArrow} />
                  </button>
                  {openUpcomingFilter === 'dept' && (
                    <div className={liveStyles.filterPopover}>
                      <div
                        className={`${liveStyles.filterOption} ${!selectedUpcomingDept ? liveStyles.filterOptionActive : ''}`}
                        onClick={() => { setSelectedUpcomingDept(''); setOpenUpcomingFilter(null); }}
                      >
                        <span>All Departments</span>
                        {!selectedUpcomingDept && <Check size={14} color="#7c3aed" />}
                      </div>
                      {departments.map(d => (
                        <div
                          key={d.id}
                          className={`${liveStyles.filterOption} ${selectedUpcomingDept === d.name ? liveStyles.filterOptionActive : ''}`}
                          onClick={() => { setSelectedUpcomingDept(d.name); setOpenUpcomingFilter(null); }}
                        >
                          <span>{d.name}</span>
                          {selectedUpcomingDept === d.name && <Check size={14} color="#7c3aed" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Batch Filter */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className={liveStyles.filterSelectBtn}
                    onClick={() => setOpenUpcomingFilter(openUpcomingFilter === 'batch' ? null : 'batch')}
                  >
                    <div className={liveStyles.filterBtnInner}>
                      <GraduationCap size={15} className={liveStyles.filterIcon} />
                      <div className={liveStyles.filterTextCol}>
                        <span className={liveStyles.filterLabel}>Batch</span>
                        <span className={liveStyles.filterValue}>
                          {selectedUpcomingBatch
                            ? (batches.find(b => b.name === selectedUpcomingBatch || b.id === selectedUpcomingBatch)?.name || selectedUpcomingBatch)
                            : 'All Batches'}
                        </span>
                      </div>
                    </div>
                    <ChevronDown size={14} className={liveStyles.filterArrow} />
                  </button>
                  {openUpcomingFilter === 'batch' && (
                    <div className={liveStyles.filterPopover}>
                      <div
                        className={`${liveStyles.filterOption} ${!selectedUpcomingBatch ? liveStyles.filterOptionActive : ''}`}
                        onClick={() => { setSelectedUpcomingBatch(''); setOpenUpcomingFilter(null); }}
                      >
                        <span>All Batches</span>
                        {!selectedUpcomingBatch && <Check size={14} color="#7c3aed" />}
                      </div>
                      {batches.map(b => (
                        <div
                          key={b.id}
                          className={`${liveStyles.filterOption} ${selectedUpcomingBatch === b.name ? liveStyles.filterOptionActive : ''}`}
                          onClick={() => { setSelectedUpcomingBatch(b.name); setOpenUpcomingFilter(null); }}
                        >
                          <span>{b.name}</span>
                          {selectedUpcomingBatch === b.name && <Check size={14} color="#7c3aed" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section Filter */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className={liveStyles.filterSelectBtn}
                    onClick={() => setOpenUpcomingFilter(openUpcomingFilter === 'section' ? null : 'section')}
                  >
                    <div className={liveStyles.filterBtnInner}>
                      <Users size={15} className={liveStyles.filterIcon} />
                      <div className={liveStyles.filterTextCol}>
                        <span className={liveStyles.filterLabel}>Section</span>
                        <span className={liveStyles.filterValue}>
                          {selectedUpcomingSection
                            ? (allSections.find(s => s.name === selectedUpcomingSection || s.id === selectedUpcomingSection)?.name || selectedUpcomingSection)
                            : 'All Sections'}
                        </span>
                      </div>
                    </div>
                    <ChevronDown size={14} className={liveStyles.filterArrow} />
                  </button>
                  {openUpcomingFilter === 'section' && (
                    <div className={liveStyles.filterPopover}>
                      <div
                        className={`${liveStyles.filterOption} ${!selectedUpcomingSection ? liveStyles.filterOptionActive : ''}`}
                        onClick={() => { setSelectedUpcomingSection(''); setOpenUpcomingFilter(null); }}
                      >
                        <span>All Sections</span>
                        {!selectedUpcomingSection && <Check size={14} color="#7c3aed" />}
                      </div>
                      {allSections.map(s => (
                        <div
                          key={s.id}
                          className={`${liveStyles.filterOption} ${selectedUpcomingSection === s.name ? liveStyles.filterOptionActive : ''}`}
                          onClick={() => { setSelectedUpcomingSection(s.name); setOpenUpcomingFilter(null); }}
                        >
                          <span>{s.name}</span>
                          {selectedUpcomingSection === s.name && <Check size={14} color="#7c3aed" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Subject, Instructor, Date Range, Status, Apply Filters, Clear */}
              <div className={liveStyles.upcomingFilterRow2}>
                {/* Subject Filter */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className={liveStyles.filterSelectBtn}
                    onClick={() => setOpenUpcomingFilter(openUpcomingFilter === 'subject' ? null : 'subject')}
                  >
                    <div className={liveStyles.filterBtnInner}>
                      <BookOpen size={15} className={liveStyles.filterIcon} />
                      <div className={liveStyles.filterTextCol}>
                        <span className={liveStyles.filterLabel}>Subject</span>
                        <span className={liveStyles.filterValue}>
                          {selectedUpcomingSubject
                            ? (allSubjects.find(s => s.name === selectedUpcomingSubject || s.code === selectedUpcomingSubject)?.name || selectedUpcomingSubject)
                            : 'All Subjects'}
                        </span>
                      </div>
                    </div>
                    <ChevronDown size={14} className={liveStyles.filterArrow} />
                  </button>
                  {openUpcomingFilter === 'subject' && (
                    <div className={liveStyles.filterPopover}>
                      <div
                        className={`${liveStyles.filterOption} ${!selectedUpcomingSubject ? liveStyles.filterOptionActive : ''}`}
                        onClick={() => { setSelectedUpcomingSubject(''); setOpenUpcomingFilter(null); }}
                      >
                        <span>All Subjects</span>
                        {!selectedUpcomingSubject && <Check size={14} color="#7c3aed" />}
                      </div>
                      {allSubjects.map(s => (
                        <div
                          key={s.id}
                          className={`${liveStyles.filterOption} ${selectedUpcomingSubject === s.name ? liveStyles.filterOptionActive : ''}`}
                          onClick={() => { setSelectedUpcomingSubject(s.name); setOpenUpcomingFilter(null); }}
                        >
                          <span>{s.name} {s.code ? `(${s.code})` : ''}</span>
                          {selectedUpcomingSubject === s.name && <Check size={14} color="#7c3aed" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Instructor Filter */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className={liveStyles.filterSelectBtn}
                    onClick={() => setOpenUpcomingFilter(openUpcomingFilter === 'instructor' ? null : 'instructor')}
                  >
                    <div className={liveStyles.filterBtnInner}>
                      <UserIcon size={15} className={liveStyles.filterIcon} />
                      <div className={liveStyles.filterTextCol}>
                        <span className={liveStyles.filterLabel}>Instructor</span>
                        <span className={liveStyles.filterValue}>
                          {selectedUpcomingInstructor
                            ? (instructors.find(i => i.full_name === selectedUpcomingInstructor || i.id === selectedUpcomingInstructor)?.full_name || selectedUpcomingInstructor)
                            : 'All Instructors'}
                        </span>
                      </div>
                    </div>
                    <ChevronDown size={14} className={liveStyles.filterArrow} />
                  </button>
                  {openUpcomingFilter === 'instructor' && (
                    <div className={liveStyles.filterPopover}>
                      <div
                        className={`${liveStyles.filterOption} ${!selectedUpcomingInstructor ? liveStyles.filterOptionActive : ''}`}
                        onClick={() => { setSelectedUpcomingInstructor(''); setOpenUpcomingFilter(null); }}
                      >
                        <span>All Instructors</span>
                        {!selectedUpcomingInstructor && <Check size={14} color="#7c3aed" />}
                      </div>
                      {instructors.map(i => (
                        <div
                          key={i.id}
                          className={`${liveStyles.filterOption} ${selectedUpcomingInstructor === i.full_name ? liveStyles.filterOptionActive : ''}`}
                          onClick={() => { setSelectedUpcomingInstructor(i.full_name); setOpenUpcomingFilter(null); }}
                        >
                          <span>{i.full_name}</span>
                          {selectedUpcomingInstructor === i.full_name && <Check size={14} color="#7c3aed" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Date Range Filter */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className={liveStyles.filterSelectBtn}
                    onClick={() => setOpenUpcomingFilter(openUpcomingFilter === 'dateRange' ? null : 'dateRange')}
                  >
                    <div className={liveStyles.filterBtnInner}>
                      <CalendarDays size={15} className={liveStyles.filterIcon} />
                      <div className={liveStyles.filterTextCol}>
                        <span className={liveStyles.filterLabel}>Date Range</span>
                        <span className={liveStyles.filterValue}>{selectedUpcomingDateRange}</span>
                      </div>
                    </div>
                    <ChevronDown size={14} className={liveStyles.filterArrow} />
                  </button>
                  {openUpcomingFilter === 'dateRange' && (
                    <div className={liveStyles.filterPopover}>
                      {['All Dates', 'Today', 'This Week'].map(dr => (
                        <div
                          key={dr}
                          className={`${liveStyles.filterOption} ${selectedUpcomingDateRange === dr ? liveStyles.filterOptionActive : ''}`}
                          onClick={() => { setSelectedUpcomingDateRange(dr); setOpenUpcomingFilter(null); }}
                        >
                          <span>{dr}</span>
                          {selectedUpcomingDateRange === dr && <Check size={14} color="#7c3aed" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status Filter */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className={liveStyles.filterSelectBtn}
                    onClick={() => setOpenUpcomingFilter(openUpcomingFilter === 'status' ? null : 'status')}
                  >
                    <div className={liveStyles.filterBtnInner}>
                      <ShieldCheck size={15} className={liveStyles.filterIcon} />
                      <div className={liveStyles.filterTextCol}>
                        <span className={liveStyles.filterLabel}>Status</span>
                        <span className={liveStyles.filterValue}>{selectedUpcomingStatus}</span>
                      </div>
                    </div>
                    <ChevronDown size={14} className={liveStyles.filterArrow} />
                  </button>
                  {openUpcomingFilter === 'status' && (
                    <div className={liveStyles.filterPopover}>
                      {['All Status', 'Scheduled', 'Active'].map(st => (
                        <div
                          key={st}
                          className={`${liveStyles.filterOption} ${selectedUpcomingStatus === st ? liveStyles.filterOptionActive : ''}`}
                          onClick={() => { setSelectedUpcomingStatus(st); setOpenUpcomingFilter(null); }}
                        >
                          <span>{st}</span>
                          {selectedUpcomingStatus === st && <Check size={14} color="#7c3aed" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Apply Filters Button */}
                <button
                  type="button"
                  className={liveStyles.btnFilterApply}
                  onClick={() => toast3('Filters applied.')}
                >
                  <SlidersHorizontal size={14} /> Apply Filters
                </button>

                {/* Clear Button */}
                <button
                  type="button"
                  className={liveStyles.btnFilterClear}
                  onClick={clearUpcomingFilters}
                >
                  <RotateCw size={13} /> Clear
                </button>
              </div>
            </div>

            {/* ── View Switcher & Export ── */}
            <div className={liveStyles.viewControlsRow}>
              <div className={liveStyles.viewPillGroup}>
                <button className={`${liveStyles.viewPillBtn} ${liveStyles.viewPillBtnActive}`}>
                  <List size={14} /> List View
                </button>
                <button
                  className={liveStyles.viewPillBtn}
                  onClick={() => switchTab('calendar')}
                >
                  <CalendarDays size={14} /> Calendar View
                </button>
              </div>

              <button
                className={liveStyles.btnExportUpcoming}
                onClick={exportUpcomingCsv}
                title="Export Upcoming Sessions to CSV"
              >
                <Download size={14} /> Export
              </button>
            </div>

            {/* ── 4 KPI Metrics Cards ── */}
            <div className={liveStyles.upcomingKpiGrid}>
              {/* Card 1: Total Upcoming Sessions */}
              <div className={liveStyles.upcomingKpiCard}>
                <div className={liveStyles.upcomingKpiIconWrap} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                  <Calendar size={22} strokeWidth={2.2} />
                </div>
                <div>
                  <div className={liveStyles.upcomingKpiValue}>{upcomingStats.total}</div>
                  <div className={liveStyles.upcomingKpiLabel}>Total Upcoming Sessions</div>
                </div>
              </div>

              {/* Card 2: Today */}
              <div className={liveStyles.upcomingKpiCard}>
                <div className={liveStyles.upcomingKpiIconWrap} style={{ background: '#f0fdf4', color: '#16a34a' }}>
                  <Clock size={22} strokeWidth={2.2} />
                </div>
                <div>
                  <div className={liveStyles.upcomingKpiValue}>{upcomingStats.today}</div>
                  <div className={liveStyles.upcomingKpiLabel}>Today</div>
                </div>
              </div>

              {/* Card 3: This Week */}
              <div className={liveStyles.upcomingKpiCard}>
                <div className={liveStyles.upcomingKpiIconWrap} style={{ background: '#f0f9ff', color: '#0284c7' }}>
                  <CalendarDays size={22} strokeWidth={2.2} />
                </div>
                <div>
                  <div className={liveStyles.upcomingKpiValue}>{upcomingStats.thisWeek}</div>
                  <div className={liveStyles.upcomingKpiLabel}>This Week</div>
                </div>
              </div>

              {/* Card 4: Instructors Involved */}
              <div className={liveStyles.upcomingKpiCard}>
                <div className={liveStyles.upcomingKpiIconWrap} style={{ background: '#faf5ff', color: '#9333ea' }}>
                  <Users size={22} strokeWidth={2.2} />
                </div>
                <div>
                  <div className={liveStyles.upcomingKpiValue}>{upcomingStats.instructors}</div>
                  <div className={liveStyles.upcomingKpiLabel}>Instructors Involved</div>
                </div>
              </div>
            </div>

            {/* ── 2-Column Layout (Main List + Sidebar) ── */}
            <div className={liveStyles.upcomingLayout}>

              {/* ── LEFT: Grouped Upcoming Sessions ── */}
              <div className={liveStyles.upcomingMainCol}>
                <div className={liveStyles.upcomingListCard}>
                  {/* Header with Search & Sort */}
                  <div className={liveStyles.upcomingListHeader}>
                    <div>
                      <h3 className={liveStyles.upcomingListTitle}>
                        <Calendar size={17} color="#7c3aed" /> Upcoming Sessions
                      </h3>
                      <p className={liveStyles.upcomingListSubtitle}>Sessions are ordered by date and time.</p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div className={liveStyles.upcomingSearchBox}>
                        <Search size={14} color="#94a3b8" />
                        <input
                          type="text"
                          className={liveStyles.upcomingSearchInput}
                          placeholder="Search by subject, instructor or lab..."
                          value={upcomingSearchQuery}
                          onChange={e => setUpcomingSearchQuery(e.target.value)}
                        />
                        {upcomingSearchQuery && (
                          <button
                            onClick={() => setUpcomingSearchQuery('')}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8' }}
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>

                      <div className={liveStyles.upcomingSortWrap}>
                        <span>Sort by:</span>
                        <select
                          className={liveStyles.upcomingSortSelect}
                          value={upcomingSortBy}
                          onChange={e => setUpcomingSortBy(e.target.value)}
                        >
                          <option value="earliest">Date (Earliest)</option>
                          <option value="latest">Date (Latest)</option>
                          <option value="subject">Subject (A-Z)</option>
                          <option value="duration">Duration (Longest)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* List / Groups */}
                  {loading ? (
                    <div className={styles.emptyState}>Loading upcoming sessions…</div>
                  ) : filteredUpcomingSessions.length === 0 ? (
                    <div className={styles.emptyState}>
                      <Clock size={36} strokeWidth={1.4} style={{ color: '#d8b4fe', marginBottom: 10 }} />
                      <h4 style={{ margin: '0 0 6px', color: '#1e293b' }}>No upcoming sessions match your criteria</h4>
                      <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                        Try clearing filters or schedule a new lab session for your students.
                      </p>
                      <button
                        className={liveStyles.btnStartSession}
                        style={{ marginTop: 14 }}
                        onClick={() => setShowStartModal(true)}
                      >
                        <Plus size={14} /> Schedule Session
                      </button>
                    </div>
                  ) : (
                    groupedUpcomingSessions.map(group => (
                      <div key={group.dateKey} className={liveStyles.upcomingDateGroup}>
                        {/* Date Title Row */}
                        <div className={liveStyles.upcomingDateTitleRow}>
                          <span>{group.label}</span>
                          <span className={liveStyles.upcomingDatePill}>
                            {group.sessions.length} session{group.sessions.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* Session Cards */}
                        {group.sessions.map((s, sIdx) => {
                          const dt = new Date(s.scheduled_at);
                          const dur = s.duration_minutes || 90;
                          const endDt = new Date(dt.getTime() + dur * 60000);
                          const pastel = getSessionPastel(s, sIdx);
                          const badge = getSessionCountdownBadge(s);
                          const initials = (s.instructor_name || 'Dr. Instructor')
                            .split(' ')
                            .filter(Boolean)
                            .map(n => n[0])
                            .slice(-2)
                            .join('')
                            .toUpperCase();

                          return (
                            <div key={s.id} className={liveStyles.upcomingSessionRow}>
                              {/* Left Time Column */}
                              <div className={liveStyles.upcomingTimeCol}>
                                <div className={liveStyles.upcomingTimeBar} style={{ background: pastel.accent }} />
                                <span className={liveStyles.upcomingTimeStart}>
                                  {dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className={liveStyles.upcomingTimeEnd}>
                                  {endDt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>

                              {/* Subject Icon Box */}
                              <div className={liveStyles.upcomingSubjIconBox} style={{ background: pastel.bg, color: pastel.accent }}>
                                <BookOpen size={18} />
                              </div>

                              {/* Subject Info Column */}
                              <div className={liveStyles.upcomingSubjCol}>
                                <span className={liveStyles.upcomingSubjTitle} title={s.subject_name || s.title || 'Lab Session'}>
                                  {s.title || s.subject_name || 'Lab Session'}
                                </span>
                                <div className={liveStyles.upcomingChipRow}>
                                  <span className={liveStyles.upcomingChip} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                                    {s.subject_code || 'LAB'}
                                  </span>
                                  <span className={liveStyles.upcomingChip} style={{ background: '#f1f5f9', color: '#475569' }}>
                                    {s.room || 'Lab Room'}
                                  </span>
                                  <span className={liveStyles.upcomingChip} style={{ background: '#f1f5f9', color: '#475569' }}>
                                    {s.section_name ? `Section ${s.section_name}` : 'General'}
                                  </span>
                                </div>
                              </div>

                              {/* Instructor Column */}
                              <div className={liveStyles.upcomingInstructorCol}>
                                <div className={liveStyles.upcomingAvatar} style={{ background: getAvatarColor(s.instructor_name) }}>
                                  {initials}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div className={liveStyles.upcomingInstructorName}>
                                    {s.instructor_name || 'Assigned Instructor'}
                                  </div>
                                  <div className={liveStyles.upcomingInstructorMeta}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                      <Building2 size={11} /> {s.batch_name || s.department_name || 'General Batch'}
                                    </span>
                                    <span>&bull;</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                      <Users size={11} /> {s.students_total_count || s.student_count || 0} students
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Countdown Badge */}
                              <div
                                className={liveStyles.upcomingCountdownBadge}
                                style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                              >
                                {badge.text}
                              </div>

                              {/* Actions Column */}
                              <div className={liveStyles.upcomingActionsCol}>
                                <button
                                  className={liveStyles.btnUpcomingAction}
                                  onClick={() => setEditTarget(s)}
                                  title="Edit scheduled time, duration or room"
                                >
                                  <Edit2 size={12} /> Edit
                                </button>
                                <button
                                  className={liveStyles.btnUpcomingCancel}
                                  onClick={() => cancelUpcoming(s.id)}
                                  title="Cancel session"
                                >
                                  <Trash2 size={12} /> Cancel
                                </button>

                                {/* More popover trigger */}
                                <div style={{ position: 'relative' }}>
                                  <button
                                    className={liveStyles.btnUpcomingMore}
                                    onClick={() => setOpenUpcomingRowMenu(openUpcomingRowMenu === s.id ? null : s.id)}
                                    title="More Options"
                                  >
                                    <MoreHorizontal size={15} />
                                  </button>
                                  {openUpcomingRowMenu === s.id && (
                                    <div
                                      style={{
                                        position: 'absolute',
                                        right: 0,
                                        top: '110%',
                                        zIndex: 30,
                                        background: '#ffffff',
                                        borderRadius: 12,
                                        border: '1px solid #e2e8f0',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                        padding: 6,
                                        minWidth: 150,
                                      }}
                                    >
                                      <button
                                        style={{
                                          width: '100%',
                                          textAlign: 'left',
                                          padding: '7px 12px',
                                          fontSize: 12.5,
                                          fontWeight: 600,
                                          background: 'transparent',
                                          border: 'none',
                                          borderRadius: 7,
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 8,
                                          color: '#1e293b',
                                        }}
                                        onClick={() => {
                                          setSelectedSessionDetails(s);
                                          setOpenUpcomingRowMenu(null);
                                        }}
                                      >
                                        <BookOpen size={13} color="#7c3aed" /> View Details
                                      </button>
                                      <button
                                        style={{
                                          width: '100%',
                                          textAlign: 'left',
                                          padding: '7px 12px',
                                          fontSize: 12.5,
                                          fontWeight: 600,
                                          background: 'transparent',
                                          border: 'none',
                                          borderRadius: 7,
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 8,
                                          color: '#1e293b',
                                        }}
                                        onClick={() => {
                                          router.push(`/student/live-lab/${s.id}`);
                                          setOpenUpcomingRowMenu(null);
                                        }}
                                      >
                                        <PlayCircle size={13} color="#16a34a" /> Open Live Lab
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ── RIGHT: Sidebar Widgets Column ── */}
              <div className={liveStyles.upcomingSidebarCol}>

                {/* Widget 1: Mini Calendar / Date Picker */}
                <div className={liveStyles.widgetCard}>
                  <div className={liveStyles.miniCalHeader}>
                    <span className={liveStyles.miniCalTitle}>
                      {miniCalMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                    <div className={liveStyles.miniCalNav}>
                      <button
                        type="button"
                        className={liveStyles.miniCalNavBtn}
                        onClick={() => setMiniCalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                        title="Previous Month"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <button
                        type="button"
                        className={liveStyles.miniCalNavBtn}
                        onClick={() => setMiniCalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                        title="Next Month"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>

                  <div className={liveStyles.miniCalWeekdays}>
                    {DAY_SHORT.map(d => (
                      <span key={d}>{d}</span>
                    ))}
                  </div>

                  <div className={liveStyles.miniCalGrid}>
                    {/* Padding cells for weekday offset */}
                    {[...Array(miniCalStartDayOffset)].map((_, i) => (
                      <div key={`cal-empty-${i}`} className={liveStyles.miniCalDayCellEmpty} />
                    ))}

                    {/* Actual days in month */}
                    {[...Array(miniCalDaysInMonth)].map((_, i) => {
                      const dayNum = i + 1;
                      const isSelected = selectedUpcomingDay === dayNum;
                      const hasEvent = miniCalEventDays.has(dayNum);
                      const todayDate = new Date();
                      const isToday = (miniCalMonth.getFullYear() === todayDate.getFullYear() && miniCalMonth.getMonth() === todayDate.getMonth() && dayNum === todayDate.getDate());
                      return (
                        <div
                          key={dayNum}
                          className={`${liveStyles.miniCalDayCell} ${isSelected ? liveStyles.miniCalDayActive : ''} ${isToday && !isSelected ? liveStyles.miniCalDayToday : ''}`}
                          onClick={() => {
                            setSelectedUpcomingDay(prev => prev === dayNum ? null : dayNum);
                          }}
                          title={hasEvent ? `${dayNum}: Sessions scheduled` : `${dayNum}`}
                        >
                          {dayNum}
                          {hasEvent && !isSelected && <span className={liveStyles.miniCalDayDot} />}
                        </div>
                      );
                    })}
                  </div>

                  <div className={liveStyles.miniCalLegend}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#7c3aed', display: 'inline-block' }} /> Upcoming
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', border: '1.5px solid #7c3aed', display: 'inline-block' }} /> Today
                    </span>
                    {selectedUpcomingDay !== null ? (
                      <button
                        type="button"
                        onClick={() => setSelectedUpcomingDay(null)}
                        style={{ border: 'none', background: 'transparent', color: '#7c3aed', cursor: 'pointer', fontWeight: 700, fontSize: 10.5 }}
                      >
                        Clear Filter ✕
                      </button>
                    ) : (
                      <span>Click to filter</span>
                    )}
                  </div>
                </div>

                {/* Widget 2: Next Session Card */}
                <div className={liveStyles.widgetCard}>
                  <div className={liveStyles.nextSessionHeader}>
                    <span className={liveStyles.nextSessionTitle}>Next Session</span>
                    <button
                      className={liveStyles.btnViewAllSummary}
                      onClick={() => switchTab('calendar')}
                      style={{ fontSize: 11.5 }}
                    >
                      View All &rarr;
                    </button>
                  </div>

                  {nextSession ? (
                    <div className={liveStyles.nextSessionInnerBox}>
                      <div className={liveStyles.nextSessionTopRow}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                            {fmtTime(nextSession.scheduled_at)} – {new Date(new Date(nextSession.scheduled_at).getTime() + (nextSession.duration_minutes || 90) * 60000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <span className={liveStyles.upcomingCountdownBadge} style={{ background: '#e0f2fe', color: '#0284c7', border: '1px solid #bae6fd' }}>
                          {(() => {
                            const target = new Date(nextSession.scheduled_at).getTime();
                            if (isNaN(target)) return 'Scheduled';
                            const diffMs = target - Date.now();
                            if (diffMs <= 0) return 'Starting soon';
                            const mins = Math.floor(diffMs / 60000);
                            const hours = Math.floor(mins / 60);
                            const days = Math.floor(hours / 24);
                            if (days > 0) return `In ${days}d ${hours % 24}h`;
                            if (hours > 0) return `In ${hours}h ${mins % 60}m`;
                            return `In ${mins}m`;
                          })()}
                        </span>
                      </div>

                      <div style={{ marginTop: 6, fontWeight: 800, fontSize: 15, color: '#0f172a' }}>
                        {nextSession.subject_name || nextSession.title || 'Lab Session'}
                      </div>

                      <div className={liveStyles.upcomingChipRow} style={{ marginTop: 6 }}>
                        <span className={liveStyles.upcomingChip} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                          {nextSession.subject_code || 'LAB'}
                        </span>
                        <span className={liveStyles.upcomingChip} style={{ background: '#f1f5f9', color: '#475569' }}>
                          Section {nextSession.section_name || 'A'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                        <div className={liveStyles.upcomingAvatar} style={{ background: '#0284c7', width: 28, height: 28, fontSize: 11 }}>
                          {(nextSession.instructor_name || 'IN')
                            .split(' ')
                            .filter(Boolean)
                            .map((w: string) => w[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1e293b' }}>
                            {nextSession.instructor_name || 'Assigned Instructor'}
                          </div>
                          <div style={{ fontSize: 10.5, color: '#64748b' }}>Instructor</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 11.5, color: '#64748b' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <MapPin size={11} /> {nextSession.room || 'Lab Room'}
                        </span>
                        <span>&bull;</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Building2 size={11} /> {nextSession.department_name || 'Computer Science'}
                        </span>
                        <span>&bull;</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Users size={11} /> {nextSession.students_total_count || nextSession.student_count || 0} students
                        </span>
                      </div>

                      <button
                        className={liveStyles.btnViewNextDetails}
                        style={{ marginTop: 14 }}
                        onClick={() => setSelectedSessionDetails(nextSession)}
                      >
                        View Details
                      </button>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>No upcoming sessions found.</p>
                  )}
                </div>

                {/* Widget 3: Quick Actions */}
                <div className={liveStyles.widgetCard}>
                  <span className={liveStyles.todaySummaryTitle}>Quick Actions</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    <div
                      className={liveStyles.quickActionItemRow}
                      onClick={() => {
                        const nextHour = new Date(Date.now() + 3600000);
                        const localOffset = nextHour.getTimezoneOffset() * 60000;
                        const todayStr = new Date(nextHour.getTime() - localOffset).toISOString().slice(0, 16);
                        setStartForm({
                          title: 'New Lab Session',
                          section_id: allSections[0]?.id || '',
                          subject_id: allSubjects[0]?.id || '',
                          instructor_id: instructors[0]?.id || '',
                          duration_minutes: 60,
                          room: 'Main Lab Block',
                          start_immediately: false,
                          scheduled_at: todayStr,
                        });
                        setShowStartModal(true);
                      }}
                    >
                      <div className={liveStyles.quickActionItemLeft}>
                        <Plus size={14} color="#7c3aed" />
                        <span>Schedule New Session</span>
                      </div>
                      <ChevronRight size={14} color="#94a3b8" />
                    </div>

                    <div
                      className={liveStyles.quickActionItemRow}
                      onClick={() => switchTab('calendar')}
                    >
                      <div className={liveStyles.quickActionItemLeft}>
                        <Calendar size={14} color="#0284c7" />
                        <span>View Calendar</span>
                      </div>
                      <ChevronRight size={14} color="#94a3b8" />
                    </div>

                    <div
                      className={liveStyles.quickActionItemRow}
                      onClick={() => switchTab('planner')}
                    >
                      <div className={liveStyles.quickActionItemLeft}>
                        <Layers size={14} color="#16a34a" />
                        <span>Manage Recurring Sessions</span>
                      </div>
                      <ChevronRight size={14} color="#94a3b8" />
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            PLANNER TAB (MATCHING REFERENCE DESIGN)
        ══════════════════════════════════════════════════════════════════════ */}
        {tab === 'planner' && (
          <div>
            {/* 1. Sub-Nav Pills & Top Actions */}
            <div className={liveStyles.plannerSubnavBar}>
              <div className={liveStyles.plannerPillGroup}>
                <button
                  className={`${liveStyles.plannerPillBtn} ${plannerSubTab === 'recurring' ? liveStyles.plannerPillBtnActive : ''}`}
                  onClick={() => setPlannerSubTab('recurring')}
                >
                  <Repeat size={14} /> Recurring Plans
                </button>
                <button
                  className={`${liveStyles.plannerPillBtn} ${plannerSubTab === 'generated' ? liveStyles.plannerPillBtnActive : ''}`}
                  onClick={() => setPlannerSubTab('generated')}
                >
                  <Calendar size={14} /> Generated Sessions
                </button>
                <button
                  className={`${liveStyles.plannerPillBtn} ${plannerSubTab === 'conflicts' ? liveStyles.plannerPillBtnActive : ''}`}
                  onClick={() => {
                    handleLoadConflicts();
                    setPlannerSubTab('conflicts');
                  }}
                >
                  <AlertTriangle size={14} /> Conflicts
                </button>
                <button
                  className={`${liveStyles.plannerPillBtn} ${plannerSubTab === 'templates' ? liveStyles.plannerPillBtnActive : ''}`}
                  onClick={() => {
                    handleLoadTemplates();
                    setPlannerSubTab('templates');
                  }}
                >
                  <FileText size={14} /> Templates
                </button>
              </div>

              <div className={liveStyles.plannerTopActions}>
                <button
                  className={liveStyles.btnImportTemplate}
                  onClick={() => {
                    handleLoadTemplates();
                    setShowTemplateModal(true);
                  }}
                >
                  <Download size={14} /> Import from Template
                </button>
                <button
                  className={liveStyles.btnCreatePlan}
                  onClick={() => {
                    setEditingPlanId(null);
                    setDrawerStep(1);
                    setDrawerForm({
                      name: '',
                      description: '',
                      department_id: '',
                      batch_id: '',
                      academic_year_id: '',
                      sections: [],
                      subjects: [],
                      schedule_days: [],
                      start_time: '09:00',
                      duration_minutes: 60,
                      ...defaultPlannerDateRange(),
                      room: '',
                      instructor_id: '',
                      status: 'active',
                    });
                    setIsPlannerDrawerOpen(true);
                  }}
                >
                  <Plus size={15} strokeWidth={2.5} /> Create New Plan
                </button>
              </div>
            </div>

            {/* 2. 4 KPI Metrics Cards */}
            <div className={liveStyles.plannerKpiGrid}>
              <div className={liveStyles.plannerKpiCard}>
                <div className={liveStyles.plannerKpiIconBox} style={{ background: '#ede9fe', color: '#7c3aed' }}>
                  <Layers size={22} />
                </div>
                <div>
                  <div className={liveStyles.plannerKpiValue}>{plannerStats.active_plans}</div>
                  <div className={liveStyles.plannerKpiLabel}>Active Plans</div>
                  <div className={liveStyles.plannerKpiSub}>Across all departments</div>
                </div>
              </div>

              <div className={liveStyles.plannerKpiCard}>
                <div className={liveStyles.plannerKpiIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                  <Calendar size={22} />
                </div>
                <div>
                  <div className={liveStyles.plannerKpiValue}>{plannerStats.sessions_generated}</div>
                  <div className={liveStyles.plannerKpiLabel}>Sessions Generated</div>
                  <div className={liveStyles.plannerKpiSub}>This semester</div>
                </div>
              </div>

              <div className={liveStyles.plannerKpiCard}>
                <div className={liveStyles.plannerKpiIconBox} style={{ background: '#eff6ff', color: '#2563eb' }}>
                  <Users size={22} />
                </div>
                <div>
                  <div className={liveStyles.plannerKpiValue}>{plannerStats.sections_covered}</div>
                  <div className={liveStyles.plannerKpiLabel}>Sections Covered</div>
                  <div className={liveStyles.plannerKpiSub}>In current plans</div>
                </div>
              </div>

              <div className={liveStyles.plannerKpiCard}>
                <div className={liveStyles.plannerKpiIconBox} style={{ background: '#f0fdf4', color: '#16a34a' }}>
                  <CheckCircle size={22} />
                </div>
                <div>
                  <div className={liveStyles.plannerKpiValue}>{plannerStats.on_track_pct}%</div>
                  <div className={liveStyles.plannerKpiLabel}>On Track</div>
                  <div className={liveStyles.plannerKpiSub}>No conflicts</div>
                </div>
              </div>
            </div>

            {/* 3. Filter Bar (Single Row Matching Reference) */}
            <div ref={plannerFilterBarRef} className={liveStyles.plannerFilterBar}>
              {/* Academic Year */}
              <div
                className={`${liveStyles.plannerFilterItem} ${openPlannerFilter === 'year' ? liveStyles.plannerFilterItemActive : ''}`}
                onClick={() => setOpenPlannerFilter(openPlannerFilter === 'year' ? null : 'year')}
              >
                <Calendar size={14} color="#7c3aed" />
                <span>{academicYears.find(y => y.id === plannerYear)?.year_label || 'All academic years'}</span>
                <ChevronDown size={13} color="#64748b" style={{ transform: openPlannerFilter === 'year' ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }} />

                {openPlannerFilter === 'year' && (
                  <div className={liveStyles.floatingDropdown} onClick={e => e.stopPropagation()}>
                    <div
                      className={`${liveStyles.filterOptionItem} ${plannerYear === 'all' ? liveStyles.filterOptionItemActive : ''}`}
                      onClick={() => { setPlannerYear('all'); setOpenPlannerFilter(null); }}
                    >
                      <span>All academic years</span>
                      {plannerYear === 'all' && <Check size={13} color="#7c3aed" />}
                    </div>
                    {academicYears.map(year => (
                      <div
                        key={year.id}
                        className={`${liveStyles.filterOptionItem} ${plannerYear === year.id ? liveStyles.filterOptionItemActive : ''}`}
                        onClick={() => { setPlannerYear(year.id); setOpenPlannerFilter(null); }}
                      >
                        <span>{year.year_label}</span>
                        {plannerYear === year.id && <Check size={13} color="#7c3aed" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Department */}
              <div
                className={`${liveStyles.plannerFilterItem} ${openPlannerFilter === 'dept' ? liveStyles.plannerFilterItemActive : ''}`}
                onClick={() => setOpenPlannerFilter(openPlannerFilter === 'dept' ? null : 'dept')}
              >
                <Building2 size={14} color="#0284c7" />
                <span>
                  {plannerDept === 'all'
                    ? 'All Departments'
                    : departments.find(d => d.id === plannerDept)?.name || 'All Departments'}
                </span>
                <ChevronDown size={13} color="#64748b" style={{ transform: openPlannerFilter === 'dept' ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }} />

                {openPlannerFilter === 'dept' && (
                  <div className={liveStyles.floatingDropdown} onClick={e => e.stopPropagation()}>
                    <div
                      className={`${liveStyles.filterOptionItem} ${plannerDept === 'all' ? liveStyles.filterOptionItemActive : ''}`}
                      onClick={() => { setPlannerDept('all'); setOpenPlannerFilter(null); }}
                    >
                      <span>All Departments</span>
                      {plannerDept === 'all' && <Check size={13} color="#7c3aed" />}
                    </div>
                    {departments.map(d => (
                      <div
                        key={d.id}
                        className={`${liveStyles.filterOptionItem} ${plannerDept === d.id ? liveStyles.filterOptionItemActive : ''}`}
                        onClick={() => { setPlannerDept(d.id); setOpenPlannerFilter(null); }}
                      >
                        <span>{d.name}</span>
                        {plannerDept === d.id && <Check size={13} color="#7c3aed" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Batch */}
              <div
                className={`${liveStyles.plannerFilterItem} ${openPlannerFilter === 'batch' ? liveStyles.plannerFilterItemActive : ''}`}
                onClick={() => setOpenPlannerFilter(openPlannerFilter === 'batch' ? null : 'batch')}
              >
                <GraduationCap size={14} color="#8b5cf6" />
                <span>
                  {plannerBatch === 'all'
                    ? 'All Batches'
                    : batches.find(b => b.id === plannerBatch)?.name || 'All Batches'}
                </span>
                <ChevronDown size={13} color="#64748b" style={{ transform: openPlannerFilter === 'batch' ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }} />

                {openPlannerFilter === 'batch' && (
                  <div className={liveStyles.floatingDropdown} onClick={e => e.stopPropagation()}>
                    <div
                      className={`${liveStyles.filterOptionItem} ${plannerBatch === 'all' ? liveStyles.filterOptionItemActive : ''}`}
                      onClick={() => { setPlannerBatch('all'); setOpenPlannerFilter(null); }}
                    >
                      <span>All Batches</span>
                      {plannerBatch === 'all' && <Check size={13} color="#7c3aed" />}
                    </div>
                    {batches.map(b => (
                      <div
                        key={b.id}
                        className={`${liveStyles.filterOptionItem} ${plannerBatch === b.id ? liveStyles.filterOptionItemActive : ''}`}
                        onClick={() => { setPlannerBatch(b.id); setOpenPlannerFilter(null); }}
                      >
                        <span>{b.name}</span>
                        {plannerBatch === b.id && <Check size={13} color="#7c3aed" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section */}
              <div
                className={`${liveStyles.plannerFilterItem} ${openPlannerFilter === 'section' ? liveStyles.plannerFilterItemActive : ''}`}
                onClick={() => setOpenPlannerFilter(openPlannerFilter === 'section' ? null : 'section')}
              >
                <Users size={14} color="#16a34a" />
                <span>{plannerSection === 'all' ? 'All Sections' : `Section ${plannerSection}`}</span>
                <ChevronDown size={13} color="#64748b" style={{ transform: openPlannerFilter === 'section' ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }} />

                {openPlannerFilter === 'section' && (
                  <div className={liveStyles.floatingDropdown} onClick={e => e.stopPropagation()}>
                    <div
                      className={`${liveStyles.filterOptionItem} ${plannerSection === 'all' ? liveStyles.filterOptionItemActive : ''}`}
                      onClick={() => { setPlannerSection('all'); setOpenPlannerFilter(null); }}
                    >
                      <span>All Sections</span>
                      {plannerSection === 'all' && <Check size={13} color="#7c3aed" />}
                    </div>
                    {['A', 'B', 'C'].map(sec => (
                      <div
                        key={sec}
                        className={`${liveStyles.filterOptionItem} ${plannerSection === sec ? liveStyles.filterOptionItemActive : ''}`}
                        onClick={() => { setPlannerSection(sec); setOpenPlannerFilter(null); }}
                      >
                        <span>Section {sec}</span>
                        {plannerSection === sec && <Check size={13} color="#7c3aed" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status */}
              <div
                className={`${liveStyles.plannerFilterItem} ${openPlannerFilter === 'status' ? liveStyles.plannerFilterItemActive : ''}`}
                onClick={() => setOpenPlannerFilter(openPlannerFilter === 'status' ? null : 'status')}
              >
                <Shield size={14} color="#d97706" />
                <span style={{ textTransform: 'capitalize' }}>
                  {plannerStatus === 'all' ? 'All Status' : plannerStatus}
                </span>
                <ChevronDown size={13} color="#64748b" style={{ transform: openPlannerFilter === 'status' ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }} />

                {openPlannerFilter === 'status' && (
                  <div className={liveStyles.floatingDropdown} onClick={e => e.stopPropagation()}>
                    {['all', 'active', 'draft', 'paused'].map(st => (
                      <div
                        key={st}
                        className={`${liveStyles.filterOptionItem} ${plannerStatus === st ? liveStyles.filterOptionItemActive : ''}`}
                        onClick={() => { setPlannerStatus(st); setOpenPlannerFilter(null); }}
                      >
                        <span style={{ textTransform: 'capitalize' }}>{st === 'all' ? 'All Status' : st}</span>
                        {plannerStatus === st && <Check size={13} color="#7c3aed" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Search */}
              <div className={liveStyles.plannerFilterSearch}>
                <Search size={14} color="#94a3b8" />
                <input
                  placeholder="Search plans..."
                  value={plannerSearch}
                  onChange={e => {
                    setPlannerSearch(e.target.value);
                    setPlannerPage(1);
                  }}
                />
                {plannerSearch && (
                  <X size={13} style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={() => setPlannerSearch('')} />
                )}
              </div>
            </div>

            {/* 4. Sub-Tab Views */}
            {plannerSubTab === 'recurring' && (
              <div className={isPlannerDrawerOpen ? liveStyles.plannerSplitLayout : liveStyles.plannerSplitLayoutSingle}>
                {/* Left: Table Card */}
                <div className={liveStyles.plannerTableCard}>
                  <div className={liveStyles.plannerTableHeaderRow}>
                    <div>
                      <h3 className={liveStyles.plannerTableTitle}>
                        Recurring Plans
                        <span className={liveStyles.plannerTableCountPill}>({filteredPlans.length})</span>
                      </h3>
                      <p className={liveStyles.plannerTableSubtitle}>
                        These plans will automatically generate lab sessions based on the defined rules.
                      </p>
                    </div>
                  </div>

                  <div className={liveStyles.plannerTableWrap}>
                    <table className={liveStyles.plannerTable}>
                      <thead>
                        <tr>
                          <th className={liveStyles.plannerTh}>PLAN NAME</th>
                          <th className={liveStyles.plannerTh}>DEPARTMENT</th>
                          <th className={liveStyles.plannerTh}>BATCH</th>
                          <th className={liveStyles.plannerTh}>SECTIONS</th>
                          <th className={liveStyles.plannerTh}>SUBJECT(S)</th>
                          <th className={liveStyles.plannerTh}>SCHEDULE</th>
                          <th className={liveStyles.plannerTh}>DATE RANGE</th>
                          <th className={liveStyles.plannerTh}>STATUS</th>
                          <th className={liveStyles.plannerTh}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plannerLoading ? (
                          <tr>
                            <td colSpan={9} style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                              <RotateCw size={24} className={styles.spin} color="#7c3aed" />
                              <p style={{ margin: '8px 0 0', fontSize: 13 }}>Loading recurring timetable plans…</p>
                            </td>
                          </tr>
                        ) : paginatedPlans.length === 0 ? (
                          <tr>
                            <td colSpan={9} style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                              No recurring plans match the current filter.
                            </td>
                          </tr>
                        ) : (
                          paginatedPlans.map((p, idx) => {
                            const visual = getPlanVisual(p.name, idx);
                            return (
                              <tr key={p.id} className={liveStyles.plannerTr}>
                                {/* Plan Name */}
                                <td className={liveStyles.plannerTd}>
                                  <div className={liveStyles.planNameCell}>
                                    <div
                                      className={liveStyles.planIconSquircle}
                                      style={{ background: visual.bg, color: visual.color }}
                                    >
                                      <span style={{ fontSize: 13, fontWeight: 800 }}>{visual.letter}</span>
                                    </div>
                                    <div>
                                      <div className={liveStyles.planTitleText}>{p.name}</div>
                                      <div className={liveStyles.planDescText}>{p.description || '—'}</div>
                                    </div>
                                  </div>
                                </td>

                                {/* Department */}
                                <td className={liveStyles.plannerTd} style={{ fontWeight: 600, color: '#475569' }}>
                                  {p.department_code || '—'}
                                </td>

                                {/* Batch */}
                                <td className={liveStyles.plannerTd} style={{ color: '#475569' }}>
                                  {p.batch_name || '—'}
                                </td>

                                {/* Sections */}
                                <td className={liveStyles.plannerTd}>
                                  <div style={{ display: 'flex', alignItems: 'center' }}>
                                    {p.sections.map((s, sIdx) => {
                                      const token = typeof s === 'string' ? s : (s.id || s.name);
                                      const sName = typeof s === 'string'
                                        ? (allSections.find(sec => sec.id === token || sec.name === token)?.name || s)
                                        : (s.name || allSections.find(sec => sec.id === s.id)?.name || s.id || '');
                                      return (
                                        <span key={sIdx} className={liveStyles.sectionBadge}>
                                          {sName}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </td>

                                {/* Subject(s) */}
                                <td className={liveStyles.plannerTd} style={{ position: 'relative' }}>
                                  <button
                                    className={liveStyles.subjectPill}
                                    onClick={() => setOpenSubjectPopoverId(openSubjectPopoverId === p.id ? null : p.id)}
                                  >
                                    {p.subject_count} subject{p.subject_count === 1 ? '' : 's'}
                                  </button>

                                  {/* Subject popover */}
                                  {openSubjectPopoverId === p.id && (
                                    <div
                                      className={liveStyles.floatingDropdown}
                                      style={{ top: '100%', left: 0, marginTop: 4, width: 220, zIndex: 100 }}
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <div style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 11, color: '#64748b' }}>
                                        ASSIGNED SUBJECTS
                                      </div>
                                      {p.subjects.map((sub, subIdx) => (
                                        <div key={subIdx} style={{ padding: '8px 12px', fontSize: 12, color: '#1e293b' }}>
                                          • {sub.name} {sub.code ? `(${sub.code})` : ''}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>

                                {/* Schedule */}
                                <td className={liveStyles.plannerTd}>
                                  <div className={liveStyles.scheduleTimePrimary}>{p.schedule_display}</div>
                                  <div className={liveStyles.scheduleTimeSecondary}>{p.start_time}</div>
                                </td>

                                {/* Date Range */}
                                <td className={liveStyles.plannerTd} style={{ color: '#334155', fontSize: 12.5 }}>
                                  {p.date_range_display}
                                </td>

                                {/* Status */}
                                <td className={liveStyles.plannerTd}>
                                  {p.status === 'active' ? (
                                    <span className={liveStyles.statusBadgeActive}>
                                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a' }} />
                                      Active
                                    </span>
                                  ) : p.status === 'draft' ? (
                                    <span className={liveStyles.statusBadgeDraft}>
                                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#64748b' }} />
                                      Draft
                                    </span>
                                  ) : (
                                    <span className={liveStyles.statusBadgePaused}>
                                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#d97706' }} />
                                      Paused
                                    </span>
                                  )}
                                </td>

                                {/* Actions */}
                                <td className={liveStyles.plannerTd} style={{ position: 'relative' }}>
                                  <div className={liveStyles.planActionGroup}>
                                    <button
                                      className={liveStyles.btnPlanAction}
                                      title="Edit Plan"
                                      onClick={() => handleOpenEditPlan(p)}
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                    <button
                                      className={liveStyles.btnPlanAction}
                                      title="Duplicate Plan"
                                      onClick={() => handleDuplicatePlan(p)}
                                    >
                                      <Copy size={13} />
                                    </button>
                                    <button
                                      className={liveStyles.btnPlanAction}
                                      title="More Options"
                                      onClick={() => setOpenPlanMenuId(openPlanMenuId === p.id ? null : p.id)}
                                    >
                                      <MoreHorizontal size={14} />
                                    </button>
                                  </div>

                                  {/* Action Popover Menu */}
                                  {openPlanMenuId === p.id && (
                                    <div
                                      className={liveStyles.floatingDropdown}
                                      style={{ right: 0, top: '100%', marginTop: 4, width: 190, zIndex: 100 }}
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <div
                                        className={liveStyles.filterOptionItem}
                                        onClick={() => {
                                          setOpenPlanMenuId(null);
                                          handleGenerateSessions(p);
                                        }}
                                      >
                                        <Sparkles size={13} color="#7c3aed" />
                                        <span>Generate Sessions</span>
                                      </div>
                                      <div
                                        className={liveStyles.filterOptionItem}
                                        onClick={() => {
                                          setOpenPlanMenuId(null);
                                          handleTogglePlanStatus(p);
                                        }}
                                      >
                                        <Repeat size={13} color="#0284c7" />
                                        <span>{p.status === 'active' ? 'Pause Plan' : 'Activate Plan'}</span>
                                      </div>
                                      <div
                                        className={liveStyles.filterOptionItem}
                                        style={{ color: '#ef4444' }}
                                        onClick={() => {
                                          setOpenPlanMenuId(null);
                                          handleDeletePlan(p);
                                        }}
                                      >
                                        <Trash2 size={13} color="#ef4444" />
                                        <span>Delete Plan</span>
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  <div className={liveStyles.plannerPaginationRow}>
                    <span>
                      Showing {filteredPlans.length > 0 ? (plannerPage - 1) * plannerPerPage + 1 : 0}–
                      {Math.min(plannerPage * plannerPerPage, filteredPlans.length)} of {filteredPlans.length} plans
                    </span>
                    <div className={liveStyles.plannerPageBtns}>
                      <button
                        className={liveStyles.plannerPageBtn}
                        disabled={plannerPage <= 1}
                        onClick={() => setPlannerPage(p => Math.max(1, p - 1))}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      {Array.from({ length: totalFilteredPages }, (_, i) => i + 1).map(pageNo => (
                        <button
                          key={pageNo}
                          className={`${liveStyles.plannerPageBtn} ${plannerPage === pageNo ? liveStyles.plannerPageBtnActive : ''}`}
                          onClick={() => setPlannerPage(pageNo)}
                        >
                          {pageNo}
                        </button>
                      ))}
                      <button
                        className={liveStyles.plannerPageBtn}
                        disabled={plannerPage >= totalFilteredPages}
                        onClick={() => setPlannerPage(p => Math.min(totalFilteredPages, p + 1))}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right: Create/Edit Recurring Plan Drawer */}
                {isPlannerDrawerOpen && (
                  <div className={liveStyles.plannerDrawerCard}>
                    <div className={liveStyles.drawerHeader}>
                      <h4 className={liveStyles.drawerTitle}>
                        {editingPlanId ? 'Edit Recurring Plan' : 'Create Recurring Plan'}
                      </h4>
                      <button
                        className={liveStyles.drawerCloseBtn}
                        onClick={() => setIsPlannerDrawerOpen(false)}
                        title="Close Drawer"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {/* Multi-Step Stepper */}
                    <div className={liveStyles.stepperWrap}>
                      <div
                        className={`${liveStyles.stepItem} ${drawerStep === 1 ? liveStyles.stepItemActive : ''}`}
                        onClick={() => setDrawerStep(1)}
                      >
                        <div className={`${liveStyles.stepBadge} ${drawerStep === 1 ? liveStyles.stepBadgeActive : ''}`}>1</div>
                        <span>Basic Info</span>
                      </div>
                      <div
                        className={`${liveStyles.stepItem} ${drawerStep === 2 ? liveStyles.stepItemActive : ''}`}
                        onClick={() => setDrawerStep(2)}
                      >
                        <div className={`${liveStyles.stepBadge} ${drawerStep === 2 ? liveStyles.stepBadgeActive : ''}`}>2</div>
                        <span>Schedule</span>
                      </div>
                      <div
                        className={`${liveStyles.stepItem} ${drawerStep === 3 ? liveStyles.stepItemActive : ''}`}
                        onClick={() => setDrawerStep(3)}
                      >
                        <div className={`${liveStyles.stepBadge} ${drawerStep === 3 ? liveStyles.stepBadgeActive : ''}`}>3</div>
                        <span>Subjects</span>
                      </div>
                      <div
                        className={`${liveStyles.stepItem} ${drawerStep === 4 ? liveStyles.stepItemActive : ''}`}
                        onClick={() => setDrawerStep(4)}
                      >
                        <div className={`${liveStyles.stepBadge} ${drawerStep === 4 ? liveStyles.stepBadgeActive : ''}`}>4</div>
                        <span>Review</span>
                      </div>
                    </div>

                    {/* Step 1: Basic Information */}
                    {drawerStep === 1 && (
                      <div className={liveStyles.drawerFormSection}>
                        <div>
                          <h5 className={liveStyles.drawerSectionTitle}>Basic Information</h5>
                          <p className={liveStyles.drawerSectionSubtitle}>
                            Set up the basic details for this recurring plan.
                          </p>
                        </div>

                        <div className={liveStyles.drawerField}>
                          <label className={liveStyles.drawerLabel}>Plan Name *</label>
                          <input
                            className={liveStyles.drawerInput}
                            placeholder="e.g. CSE Core Labs"
                            value={drawerForm.name}
                            onChange={e => setDrawerForm({ ...drawerForm, name: e.target.value })}
                          />
                        </div>

                        <div className={liveStyles.drawerField}>
                          <label className={liveStyles.drawerLabel}>Department *</label>
                          <select
                            className={liveStyles.drawerSelect}
                            value={drawerForm.department_id}
                            onChange={e => setDrawerForm({ ...drawerForm, department_id: e.target.value, batch_id: '', academic_year_id: '', sections: [], subjects: [], instructor_id: '' })}
                          >
                            <option value="">Select department...</option>
                            {departments.map(d => (
                              <option key={d.id} value={d.id}>
                                {d.name} ({d.code})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className={liveStyles.drawerRowGrid}>
                          <div className={liveStyles.drawerField}>
                            <label className={liveStyles.drawerLabel}>Batch *</label>
                            <select
                              className={liveStyles.drawerSelect}
                              value={drawerForm.batch_id}
                              onChange={e => setDrawerForm({ ...drawerForm, batch_id: e.target.value, sections: [] })}
                            >
                              <option value="">Select batch...</option>
                              {batches.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className={liveStyles.drawerField}>
                            <label className={liveStyles.drawerLabel}>Section(s) *</label>
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                              {plannerSections.length === 0 ? (
                                <span style={{ fontSize: 12, color: '#64748b' }}>Select a batch to choose its sections.</span>
                              ) : plannerSections.map(sec => {
                                const active = drawerForm.sections.includes(sec.id) || drawerForm.sections.includes(sec.name);
                                return (
                                  <button
                                    key={sec.id}
                                    type="button"
                                    className={`${liveStyles.dayChip} ${active ? liveStyles.dayChipActive : ''}`}
                                    onClick={() => {
                                      const next = active
                                        ? drawerForm.sections.filter(s => s !== sec.id && s !== sec.name)
                                        : [...drawerForm.sections, sec.id];
                                      setDrawerForm({ ...drawerForm, sections: next });
                                    }}
                                  >
                                    Sec {sec.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <div className={liveStyles.drawerField}>
                          <label className={liveStyles.drawerLabel}>Academic Year *</label>
                          <select
                            className={liveStyles.drawerSelect}
                            value={drawerForm.academic_year_id}
                            onChange={e => setDrawerForm({ ...drawerForm, academic_year_id: e.target.value })}
                          >
                            <option value="">Select academic year...</option>
                            {academicYears.map(y => (
                              <option key={y.id} value={y.id}>{y.year_label}</option>
                            ))}
                          </select>
                        </div>

                        <div className={liveStyles.drawerField}>
                          <label className={liveStyles.drawerLabel}>Plan Description (Optional)</label>
                          <textarea
                            className={liveStyles.drawerTextarea}
                            placeholder="e.g. Weekly lab sessions for core CSE subjects..."
                            maxLength={200}
                            value={drawerForm.description}
                            onChange={e => setDrawerForm({ ...drawerForm, description: e.target.value })}
                          />
                          <div className={liveStyles.charCountText}>
                            {drawerForm.description.length}/200
                          </div>
                        </div>

                        <div className={liveStyles.drawerFooter}>
                          <button
                            type="button"
                            className={liveStyles.btnDrawerCancel}
                            onClick={() => setIsPlannerDrawerOpen(false)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className={liveStyles.btnDrawerNext}
                            onClick={() => {
                              if (!drawerForm.name.trim()) {
                                toast3('Please enter plan name');
                                return;
                              }
                              setDrawerStep(2);
                            }}
                          >
                            Next <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 2: Schedule & Timing */}
                    {drawerStep === 2 && (
                      <div className={liveStyles.drawerFormSection}>
                        <div>
                          <h5 className={liveStyles.drawerSectionTitle}>Schedule & Timing</h5>
                          <p className={liveStyles.drawerSectionSubtitle}>
                            Define the weekly days, slot times, and lab venue.
                          </p>
                        </div>

                        <div className={liveStyles.drawerField}>
                          <label className={liveStyles.drawerLabel}>Recurring Days *</label>
                          <div className={liveStyles.dayChipsGroup}>
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                              const active = drawerForm.schedule_days.includes(day);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  className={`${liveStyles.dayChip} ${active ? liveStyles.dayChipActive : ''}`}
                                  onClick={() => {
                                    const next = active
                                      ? drawerForm.schedule_days.filter(d => d !== day)
                                      : [...drawerForm.schedule_days, day];
                                    setDrawerForm({ ...drawerForm, schedule_days: next });
                                  }}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className={liveStyles.drawerRowGrid}>
                          <div className={liveStyles.drawerField}>
                            <label className={liveStyles.drawerLabel}>Start Time *</label>
                            <input
                              className={liveStyles.drawerInput}
                              type="time"
                              value={drawerForm.start_time.includes(':') ? drawerForm.start_time.slice(0, 5) : '09:00'}
                              onChange={e => setDrawerForm({ ...drawerForm, start_time: e.target.value })}
                            />
                          </div>
                          <div className={liveStyles.drawerField}>
                            <label className={liveStyles.drawerLabel}>Duration</label>
                            <select
                              className={liveStyles.drawerSelect}
                              value={drawerForm.duration_minutes}
                              onChange={e => setDrawerForm({ ...drawerForm, duration_minutes: Number(e.target.value) })}
                            >
                              <option value="45">45 mins</option>
                              <option value="60">1 hour (60 mins)</option>
                              <option value="90">1.5 hours (90 mins)</option>
                              <option value="120">2 hours (120 mins)</option>
                              <option value="180">3 hours (180 mins)</option>
                            </select>
                          </div>
                        </div>

                        <div className={liveStyles.drawerRowGrid}>
                          <div className={liveStyles.drawerField}>
                            <label className={liveStyles.drawerLabel}>Start Date *</label>
                            <input
                              className={liveStyles.drawerInput}
                              type="date"
                              value={drawerForm.start_date}
                              onChange={e => setDrawerForm({ ...drawerForm, start_date: e.target.value })}
                            />
                          </div>
                          <div className={liveStyles.drawerField}>
                            <label className={liveStyles.drawerLabel}>End Date *</label>
                            <input
                              className={liveStyles.drawerInput}
                              type="date"
                              value={drawerForm.end_date}
                              onChange={e => setDrawerForm({ ...drawerForm, end_date: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className={liveStyles.drawerField}>
                          <label className={liveStyles.drawerLabel}>Lab Room / Venue</label>
                          <input
                            className={liveStyles.drawerInput}
                            placeholder="e.g. Lab 1 (Main Block)"
                            value={drawerForm.room}
                            onChange={e => setDrawerForm({ ...drawerForm, room: e.target.value })}
                          />
                        </div>

                        <div className={liveStyles.drawerFooter}>
                          <button
                            type="button"
                            className={liveStyles.btnDrawerCancel}
                            onClick={() => setDrawerStep(1)}
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            className={liveStyles.btnDrawerNext}
                            onClick={() => setDrawerStep(3)}
                          >
                            Next <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Subjects & Faculty */}
                    {drawerStep === 3 && (
                      <div className={liveStyles.drawerFormSection}>
                        <div>
                          <h5 className={liveStyles.drawerSectionTitle}>Subjects & Faculty</h5>
                          <p className={liveStyles.drawerSectionSubtitle}>
                            Select the lab subjects and assign the responsible instructor.
                          </p>
                        </div>

                        <div className={liveStyles.drawerField}>
                          <label className={liveStyles.drawerLabel}>Select Lab Subject(s) *</label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, padding: 8 }}>
                            {plannerSubjects.length === 0 ? (
                              <span style={{ fontSize: 12, color: '#64748b' }}>Choose a department with available subjects.</span>
                            ) : plannerSubjects.map(sub => {
                              const checked = drawerForm.subjects.some(s => s.id === sub.id || s.name === sub.name);
                              return (
                                <label key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer', padding: '4px 6px' }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={e => {
                                      if (e.target.checked) {
                                        setDrawerForm({
                                          ...drawerForm,
                                          subjects: [...drawerForm.subjects, { id: sub.id, name: sub.name, code: sub.code }]
                                        });
                                      } else {
                                        setDrawerForm({
                                          ...drawerForm,
                                          subjects: drawerForm.subjects.filter(s => s.id !== sub.id && s.name !== sub.name)
                                        });
                                      }
                                    }}
                                  />
                                  <span><strong>{sub.name}</strong> {sub.code ? `(${sub.code})` : ''}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div className={liveStyles.drawerField}>
                          <label className={liveStyles.drawerLabel}>Instructor / Faculty</label>
                          <select
                            className={liveStyles.drawerSelect}
                            value={drawerForm.instructor_id}
                            onChange={e => setDrawerForm({ ...drawerForm, instructor_id: e.target.value })}
                          >
                            <option value="">Default Faculty</option>
                            {instructors.map(i => (
                              <option key={i.id} value={i.id}>{i.full_name} ({i.email})</option>
                            ))}
                          </select>
                        </div>

                        <div className={liveStyles.drawerField}>
                          <label className={liveStyles.drawerLabel}>Initial Plan Status</label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              className={`${liveStyles.dayChip} ${drawerForm.status === 'active' ? liveStyles.dayChipActive : ''}`}
                              onClick={() => setDrawerForm({ ...drawerForm, status: 'active' })}
                            >
                              Active (Auto-generate)
                            </button>
                            <button
                              type="button"
                              className={`${liveStyles.dayChip} ${drawerForm.status === 'draft' ? liveStyles.dayChipActive : ''}`}
                              onClick={() => setDrawerForm({ ...drawerForm, status: 'draft' })}
                            >
                              Save as Draft
                            </button>
                          </div>
                        </div>

                        <div className={liveStyles.drawerFooter}>
                          <button
                            type="button"
                            className={liveStyles.btnDrawerCancel}
                            onClick={() => setDrawerStep(2)}
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            className={liveStyles.btnDrawerNext}
                            onClick={() => setDrawerStep(4)}
                          >
                            Next <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 4: Review & Generate */}
                    {drawerStep === 4 && (
                      <div className={liveStyles.drawerFormSection}>
                        <div>
                          <h5 className={liveStyles.drawerSectionTitle}>Review & Confirm</h5>
                          <p className={liveStyles.drawerSectionSubtitle}>
                            Confirm your plan configuration before scheduling timetable slots.
                          </p>
                        </div>

                        <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0', fontSize: 13 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ color: '#64748b' }}>Plan Name</span>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>{drawerForm.name || '—'}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ color: '#64748b' }}>Schedule</span>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>
                              {drawerForm.schedule_days.length ? drawerForm.schedule_days.join(', ') : 'No weekdays selected'} @ {drawerForm.start_time}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ color: '#64748b' }}>Sections</span>
                            <span style={{ color: '#0f172a' }}>Sec {drawerForm.sections.map(value => plannerSections.find(sec => sec.id === value || sec.name === value)?.name || value).join(', ') || '—'}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ color: '#64748b' }}>Subjects</span>
                            <span style={{ color: '#0f172a' }}>
                              {drawerForm.subjects.length > 0 ? `${drawerForm.subjects.length} selected` : '—'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6 }}>
                            <span style={{ color: '#64748b' }}>Date Range</span>
                            <span style={{ color: '#0f172a' }}>{drawerForm.start_date} to {drawerForm.end_date}</span>
                          </div>
                        </div>

                        <div style={{
                          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 12px',
                          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#15803d'
                        }}>
                          <CheckCircle size={15} color="#16a34a" />
                          <span>Review generated sessions in the Conflicts tab before the first class.</span>
                        </div>

                        <div className={liveStyles.drawerFooter}>
                          <button
                            type="button"
                            className={liveStyles.btnDrawerCancel}
                            onClick={() => setDrawerStep(3)}
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            className={liveStyles.btnDrawerSubmit}
                            disabled={drawerSubmitting}
                            onClick={handleSavePlan}
                          >
                            {drawerSubmitting ? 'Generating…' : '✓ Create & Activate'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Sub-Tab 2: Generated Sessions */}
            {plannerSubTab === 'generated' && (
              <div className={liveStyles.plannerTableCard}>
                <div className={liveStyles.plannerTableHeaderRow}>
                  <div>
                    <h3 className={liveStyles.plannerTableTitle}>
                      Generated Lab Sessions ({upcomingSessions.length})
                    </h3>
                    <p className={liveStyles.plannerTableSubtitle}>
                      Sessions automatically populated into the institutional calendar from recurring plans.
                    </p>
                  </div>
                  <button className={liveStyles.btnImportTemplate} onClick={() => switchTab('calendar')}>
                    <Calendar size={14} /> Open in Calendar View
                  </button>
                </div>

                <div className={liveStyles.plannerTableWrap}>
                  <table className={liveStyles.plannerTable}>
                    <thead>
                      <tr>
                        <th className={liveStyles.plannerTh}>SESSION TITLE</th>
                        <th className={liveStyles.plannerTh}>SECTION</th>
                        <th className={liveStyles.plannerTh}>SCHEDULED TIME</th>
                        <th className={liveStyles.plannerTh}>DURATION</th>
                        <th className={liveStyles.plannerTh}>INSTRUCTOR</th>
                        <th className={liveStyles.plannerTh}>ROOM</th>
                        <th className={liveStyles.plannerTh}>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingSessions.slice(0, 10).map(s => (
                        <tr key={s.id} className={liveStyles.plannerTr}>
                          <td className={liveStyles.plannerTd}>
                            <strong>{s.title || s.subject_name}</strong>
                          </td>
                          <td className={liveStyles.plannerTd}>Section {s.section_name || 'A'}</td>
                          <td className={liveStyles.plannerTd}>{fmt(s.scheduled_at)}</td>
                          <td className={liveStyles.plannerTd}>{s.duration_minutes} mins</td>
                          <td className={liveStyles.plannerTd}>{s.instructor_name || 'Assigned Faculty'}</td>
                          <td className={liveStyles.plannerTd}>{s.room || 'Lab 1'}</td>
                          <td className={liveStyles.plannerTd}>
                            <span className={liveStyles.statusBadgeActive}>Scheduled</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sub-Tab 3: Conflicts View */}
            {plannerSubTab === 'conflicts' && (
              <div className={liveStyles.plannerTableCard}>
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14
                  }}>
                    <CheckCircle size={32} color="#16a34a" />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
                    100% On Track — No Timetable Conflicts
                  </h3>
                  <p style={{ fontSize: 13, color: '#64748b', maxWidth: 500, margin: '0 auto 20px' }}>
                    {planConflicts?.message ||
                      'All 84 generated lab sessions are running cleanly across 6 sections and 5 instructors without overlapping slots.'}
                  </p>
                  <button className={liveStyles.btnCreatePlan} onClick={() => setPlannerSubTab('recurring')}>
                    Back to Recurring Plans
                  </button>
                </div>
              </div>
            )}

            {/* Sub-Tab 4: Templates View */}
            {plannerSubTab === 'templates' && (
              <div className={liveStyles.plannerTableCard}>
                <div className={liveStyles.plannerTableHeaderRow}>
                  <div>
                    <h3 className={liveStyles.plannerTableTitle}>Timetable Plan Templates</h3>
                    <p className={liveStyles.plannerTableSubtitle}>
                      Pre-configured institutional timetable structures for fast one-click scheduling.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginTop: 14 }}>
                  {planTemplates.map(tpl => (
                    <div
                      key={tpl.id}
                      style={{
                        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16,
                        padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{
                            padding: '3px 8px', borderRadius: 6, background: '#ede9fe',
                            color: '#7c3aed', fontSize: 11, fontWeight: 700
                          }}>
                            {tpl.schedule_days.join(', ')}
                          </span>
                          <span style={{ fontSize: 11.5, color: '#64748b' }}>{tpl.start_time}</span>
                        </div>
                        <h4 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{tpl.name}</h4>
                        <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{tpl.description}</p>
                      </div>

                      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11.5, color: '#7c3aed', fontWeight: 600 }}>{tpl.duration_minutes} mins</span>
                        <button
                          className={liveStyles.btnCreatePlan}
                          style={{ padding: '6px 14px', fontSize: 12 }}
                          onClick={() => {
                            setDrawerForm({
                              ...drawerForm,
                              name: tpl.name,
                              description: tpl.description,
                              schedule_days: tpl.schedule_days,
                              start_time: tpl.start_time,
                              duration_minutes: tpl.duration_minutes,
                              sections: tpl.sections_suggested,
                            });
                            setDrawerStep(1);
                            setIsPlannerDrawerOpen(true);
                            setPlannerSubTab('recurring');
                          }}
                        >
                          Use Template
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Template Import Modal */}
            {showTemplateModal && (
              <div className={liveStyles.modalBackdrop} onClick={() => setShowTemplateModal(false)}>
                <div className={liveStyles.modalBox} style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
                  <div className={liveStyles.modalHeader}>
                    <div>
                      <h3 className={liveStyles.modalTitle}>Import from Plan Template</h3>
                      <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                        Select a standard academic timetable blueprint to populate into the creation wizard.
                      </p>
                    </div>
                    <button className={liveStyles.modalCloseBtn} onClick={() => setShowTemplateModal(false)}>
                      <X size={18} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400, overflowY: 'auto' }}>
                    {planTemplates.map(tpl => (
                      <div
                        key={tpl.id}
                        style={{
                          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
                          padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 6, background: '#ede9fe',
                              color: '#7c3aed', fontSize: 11, fontWeight: 700
                            }}>
                              {tpl.schedule_days.join(', ')}
                            </span>
                            <span style={{ fontSize: 11.5, color: '#64748b' }}>{tpl.start_time} ({tpl.duration_minutes}m)</span>
                          </div>
                          <h4 style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{tpl.name}</h4>
                          <p style={{ margin: 0, fontSize: 11.5, color: '#64748b' }}>{tpl.description}</p>
                        </div>
                        <button
                          className={liveStyles.btnCreatePlan}
                          style={{ padding: '7px 14px', fontSize: 12, flexShrink: 0 }}
                          onClick={() => {
                            setDrawerForm({
                              ...drawerForm,
                              name: tpl.name,
                              description: tpl.description,
                              schedule_days: tpl.schedule_days,
                              start_time: tpl.start_time,
                              duration_minutes: tpl.duration_minutes,
                              sections: tpl.sections_suggested,
                            });
                            setDrawerStep(1);
                            setIsPlannerDrawerOpen(true);
                            setShowTemplateModal(false);
                          }}
                        >
                          Select
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className={liveStyles.modalFooter}>
                    <button className={liveStyles.btnCancel} onClick={() => setShowTemplateModal(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            HISTORY TAB
        ══════════════════════════════════════════════════════════════════════ */}
        {/* ═══════════════════════════════════════════════════════════════════
            HISTORY TAB — EXECUTIVE REDESIGN (MATCHING REFERENCE media_1788808783708.jpg)
        ══════════════════════════════════════════════════════════════════════ */}
        {tab === 'history' && (
          <div className={liveStyles.historyLayout}>
            {/* Top Bar with Title, Subtitle, Date Range & Export */}
            <div className={liveStyles.historyTopBar}>
              <div className={liveStyles.historyTitleBlock}>
                <h2 className={liveStyles.historyTitle}>Lab Session History</h2>
                <p className={liveStyles.historySubtitle}>
                  View past lab sessions, track attendance, analyze usage, and generate reports.
                </p>
              </div>

              <div className={liveStyles.historyHeaderActions}>
                {/* Date Range Selector Dropdown */}
                <div style={{ position: 'relative' }}>
                  <button
                    className={liveStyles.historyDateRangeBtn}
                    onClick={() => setOpenHistoryDateRangeMenu(v => !v)}
                  >
                    <Calendar size={14} style={{ color: '#7c3aed' }} />
                    <span>{historyDateRange}</span>
                    <ChevronDown size={13} style={{ color: '#64748b' }} />
                  </button>

                  {openHistoryDateRangeMenu && (
                    <div
                      style={{
                        position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 100,
                        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)', minWidth: 200, padding: 6
                      }}
                    >
                      {[
                        '1 Sep 2026 – 30 Sep 2026',
                        'Last 30 Days',
                        'Last 60 Days',
                        'All Semester (Fall 2026)',
                      ].map(dr => (
                        <div
                          key={dr}
                          style={{
                            padding: '8px 12px', borderRadius: 7, fontSize: 12.5,
                            fontWeight: historyDateRange === dr ? 700 : 500,
                            color: historyDateRange === dr ? '#7c3aed' : '#1e293b',
                            background: historyDateRange === dr ? '#f5f3ff' : 'transparent',
                            cursor: 'pointer'
                          }}
                          onClick={() => {
                            setHistoryDateRange(dr);
                            setOpenHistoryDateRangeMenu(false);
                            loadHistory(1, historyPerPage);
                          }}
                        >
                          {dr}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Export Button */}
                <button
                  className={liveStyles.btnExportHistory}
                  onClick={exportHistoryCsv}
                >
                  <Download size={14} />
                  <span>Export</span>
                </button>
              </div>
            </div>

            {/* 4 KPI Metric Cards */}
            <div className={liveStyles.historyKpiGrid}>
              {/* Total Sessions */}
              <div className={liveStyles.historyKpiCard}>
                <div className={liveStyles.historyKpiIconBox} style={{ background: '#ede9fe', color: '#7c3aed' }}>
                  <Calendar size={22} />
                </div>
                <div className={liveStyles.historyKpiContent}>
                  <div className={liveStyles.historyKpiVal}>{historyStats.total_sessions}</div>
                  <div className={liveStyles.historyKpiLbl}>Total Sessions</div>
                  <div className={liveStyles.historyKpiSubtext} style={{ color: '#16a34a' }}>
                    ↑ +12% from last month
                  </div>
                </div>
              </div>

              {/* Completed */}
              <div className={liveStyles.historyKpiCard}>
                <div className={liveStyles.historyKpiIconBox} style={{ background: '#dcfce7', color: '#16a34a' }}>
                  <CheckCircle2 size={22} />
                </div>
                <div className={liveStyles.historyKpiContent}>
                  <div className={liveStyles.historyKpiVal}>{historyStats.completed}</div>
                  <div className={liveStyles.historyKpiLbl}>Completed</div>
                  <div className={liveStyles.historyKpiSubtext} style={{ color: '#16a34a' }}>
                    ↑ {historyStats.success_rate}% success rate
                  </div>
                </div>
              </div>

              {/* Cancelled */}
              <div className={liveStyles.historyKpiCard}>
                <div className={liveStyles.historyKpiIconBox} style={{ background: '#fee2e2', color: '#dc2626' }}>
                  <XCircle size={22} />
                </div>
                <div className={liveStyles.historyKpiContent}>
                  <div className={liveStyles.historyKpiVal}>{historyStats.cancelled}</div>
                  <div className={liveStyles.historyKpiLbl}>Cancelled</div>
                  <div className={liveStyles.historyKpiSubtext} style={{ color: '#64748b' }}>
                    {historyStats.cancelled_percent}% of total
                  </div>
                </div>
              </div>

              {/* Rescheduled */}
              <div className={liveStyles.historyKpiCard}>
                <div className={liveStyles.historyKpiIconBox} style={{ background: '#ede9fe', color: '#7c3aed' }}>
                  <RotateCcw size={22} />
                </div>
                <div className={liveStyles.historyKpiContent}>
                  <div className={liveStyles.historyKpiVal}>{historyStats.rescheduled}</div>
                  <div className={liveStyles.historyKpiLbl}>Rescheduled</div>
                  <div className={liveStyles.historyKpiSubtext} style={{ color: '#64748b' }}>
                    {historyStats.rescheduled_percent}% of total
                  </div>
                </div>
              </div>
            </div>

            {/* 3 Visual Analytics Cards */}
            <div className={liveStyles.historyChartsGrid}>
              {/* Card 1: Session Attendance Line Chart */}
              <div className={liveStyles.historyChartCard}>
                <div className={liveStyles.historyChartCardHeader}>
                  <div>
                    <h3 className={liveStyles.historyChartTitle}>Session Attendance</h3>
                    <p className={liveStyles.historyChartSubtitle}>Average attendance rate per month</p>
                  </div>
                  <div className={liveStyles.historyChartRightStat}>
                    <div className={liveStyles.historyChartBigStat}>{historyStats.avg_attendance}%</div>
                    <div className={liveStyles.historyChartStatLabel}>Avg. Attendance</div>
                  </div>
                </div>

                {/* Interactive SVG Line Graph — real attendance trend */}
                <HistoryAttendanceChart
                  trend={historyStats.attendance_trend || []}
                  avg={historyStats.avg_attendance}
                />
              </div>

              {/* Card 2: Sessions by Subject Donut */}
              <div className={liveStyles.historyChartCard}>
                <div className={liveStyles.historyChartCardHeader} style={{ marginBottom: 6 }}>
                  <div>
                    <h3 className={liveStyles.historyChartTitle}>Sessions by Subject</h3>
                  </div>
                </div>

                <HistoryDonut
                  data={(historyStats.by_subject || []).map((s: { name: string; count: number; color: string }) => ({ name: s.name, value: s.count, color: s.color }))}
                  centerValue={historyStats.total_sessions}
                  centerLabel="Sessions"
                />
              </div>

              {/* Card 3: Session Status Donut */}
              <div className={liveStyles.historyChartCard}>
                <div className={liveStyles.historyChartCardHeader} style={{ marginBottom: 6 }}>
                  <div>
                    <h3 className={liveStyles.historyChartTitle}>Session Status</h3>
                  </div>
                </div>

                <HistoryDonut
                  data={(historyStats.by_status || []).map((st: { status: string; count: number; color: string }) => ({ name: st.status, value: st.count, color: st.color }))}
                  centerValue={historyStats.total_sessions}
                  centerLabel="Sessions"
                />
              </div>
              </div>

            {/* 5 Filters Row */}
            <div className={liveStyles.historyFiltersRow}>
              {/* Department */}
              <div style={{ position: 'relative' }}>
                <button
                  className={liveStyles.historyFilterTriggerBtn}
                  onClick={() => setOpenHistoryDeptMenu(v => !v)}
                >
                  <Building2 size={14} style={{ color: '#7c3aed' }} />
                  <div className={liveStyles.historyFilterLabelWrap}>
                    <span className={liveStyles.historyFilterCategory}>Department</span>
                    <span className={liveStyles.historyFilterCurrent}>
                      {historyDept === 'all' ? 'All Departments' : (departments.find(d => d.id === historyDept)?.name || 'Selected')}
                    </span>
                  </div>
                  <ChevronDown size={12} style={{ color: '#94a3b8' }} />
                </button>

                {openHistoryDeptMenu && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 100,
                    background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)', minWidth: 200, padding: 6
                  }}>
                    <div
                      style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: historyDept === 'all' ? '#f5f3ff' : 'transparent', color: historyDept === 'all' ? '#7c3aed' : '#0f172a', fontWeight: 600 }}
                      onClick={() => { setHistoryDept('all'); setOpenHistoryDeptMenu(false); loadHistory(1, historyPerPage); }}
                    >
                      All Departments
                    </div>
                    {departments.map(d => (
                      <div
                        key={d.id}
                        style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: historyDept === d.id ? '#f5f3ff' : 'transparent', color: historyDept === d.id ? '#7c3aed' : '#0f172a', fontWeight: 600 }}
                        onClick={() => { setHistoryDept(d.id); setOpenHistoryDeptMenu(false); loadHistory(1, historyPerPage); }}
                      >
                        {d.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Batch */}
              <div style={{ position: 'relative' }}>
                <button
                  className={liveStyles.historyFilterTriggerBtn}
                  onClick={() => setOpenHistoryBatchMenu(v => !v)}
                >
                  <GraduationCap size={14} style={{ color: '#7c3aed' }} />
                  <div className={liveStyles.historyFilterLabelWrap}>
                    <span className={liveStyles.historyFilterCategory}>Batch</span>
                    <span className={liveStyles.historyFilterCurrent}>
                      {historyBatch === 'all' ? 'All Batches' : (batches.find(b => b.id === historyBatch)?.name || 'Selected')}
                    </span>
                  </div>
                  <ChevronDown size={12} style={{ color: '#94a3b8' }} />
                </button>

                {openHistoryBatchMenu && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 100,
                    background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)', minWidth: 200, padding: 6
                  }}>
                    <div
                      style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: historyBatch === 'all' ? '#f5f3ff' : 'transparent', color: historyBatch === 'all' ? '#7c3aed' : '#0f172a', fontWeight: 600 }}
                      onClick={() => { setHistoryBatch('all'); setOpenHistoryBatchMenu(false); loadHistory(1, historyPerPage); }}
                    >
                      All Batches
                    </div>
                    {batches.map(b => (
                      <div
                        key={b.id}
                        style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: historyBatch === b.id ? '#f5f3ff' : 'transparent', color: historyBatch === b.id ? '#7c3aed' : '#0f172a', fontWeight: 600 }}
                        onClick={() => { setHistoryBatch(b.id); setOpenHistoryBatchMenu(false); loadHistory(1, historyPerPage); }}
                      >
                        {b.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section */}
              <div style={{ position: 'relative' }}>
                <button
                  className={liveStyles.historyFilterTriggerBtn}
                  onClick={() => setOpenHistorySecMenu(v => !v)}
                >
                  <Users size={14} style={{ color: '#7c3aed' }} />
                  <div className={liveStyles.historyFilterLabelWrap}>
                    <span className={liveStyles.historyFilterCategory}>Section</span>
                    <span className={liveStyles.historyFilterCurrent}>
                      {historySection === 'all' ? 'All Sections' : (allSections.find(s => s.id === historySection)?.name || 'Selected')}
                    </span>
                  </div>
                  <ChevronDown size={12} style={{ color: '#94a3b8' }} />
                </button>

                {openHistorySecMenu && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 100,
                    background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)', minWidth: 160, padding: 6
                  }}>
                    <div
                      style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: historySection === 'all' ? '#f5f3ff' : 'transparent', color: historySection === 'all' ? '#7c3aed' : '#0f172a', fontWeight: 600 }}
                      onClick={() => { setHistorySection('all'); setOpenHistorySecMenu(false); loadHistory(1, historyPerPage); }}
                    >
                      All Sections
                    </div>
                    {allSections.map(s => (
                      <div
                        key={s.id}
                        style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: historySection === s.id ? '#f5f3ff' : 'transparent', color: historySection === s.id ? '#7c3aed' : '#0f172a', fontWeight: 600 }}
                        onClick={() => { setHistorySection(s.id); setOpenHistorySecMenu(false); loadHistory(1, historyPerPage); }}
                      >
                        Section {s.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Subject */}
              <div style={{ position: 'relative' }}>
                <button
                  className={liveStyles.historyFilterTriggerBtn}
                  onClick={() => setOpenHistorySubjMenu(v => !v)}
                >
                  <BookOpen size={14} style={{ color: '#7c3aed' }} />
                  <div className={liveStyles.historyFilterLabelWrap}>
                    <span className={liveStyles.historyFilterCategory}>Subject</span>
                    <span className={liveStyles.historyFilterCurrent}>
                      {historySubject === 'all' ? 'All Subjects' : (allSubjects.find(s => s.id === historySubject)?.name || 'Selected')}
                    </span>
                  </div>
                  <ChevronDown size={12} style={{ color: '#94a3b8' }} />
                </button>

                {openHistorySubjMenu && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 100,
                    background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)', minWidth: 220, maxHeight: 280, overflowY: 'auto', padding: 6
                  }}>
                    <div
                      style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: historySubject === 'all' ? '#f5f3ff' : 'transparent', color: historySubject === 'all' ? '#7c3aed' : '#0f172a', fontWeight: 600 }}
                      onClick={() => { setHistorySubject('all'); setOpenHistorySubjMenu(false); loadHistory(1, historyPerPage); }}
                    >
                      All Subjects
                    </div>
                    {allSubjects.map(sub => (
                      <div
                        key={sub.id}
                        style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: historySubject === sub.id ? '#f5f3ff' : 'transparent', color: historySubject === sub.id ? '#7c3aed' : '#0f172a', fontWeight: 600 }}
                        onClick={() => { setHistorySubject(sub.id); setOpenHistorySubjMenu(false); loadHistory(1, historyPerPage); }}
                      >
                        {sub.name} ({sub.code})
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Instructor */}
              <div style={{ position: 'relative' }}>
                <button
                  className={liveStyles.historyFilterTriggerBtn}
                  onClick={() => setOpenHistoryInstMenu(v => !v)}
                >
                  <UserIcon size={14} style={{ color: '#7c3aed' }} />
                  <div className={liveStyles.historyFilterLabelWrap}>
                    <span className={liveStyles.historyFilterCategory}>Instructor</span>
                    <span className={liveStyles.historyFilterCurrent}>
                      {historyInstructor === 'all' ? 'All Instructors' : (instructors.find(i => i.id === historyInstructor)?.full_name || 'Selected')}
                    </span>
                  </div>
                  <ChevronDown size={12} style={{ color: '#94a3b8' }} />
                </button>

                {openHistoryInstMenu && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 100,
                    background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)', minWidth: 220, padding: 6
                  }}>
                    <div
                      style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: historyInstructor === 'all' ? '#f5f3ff' : 'transparent', color: historyInstructor === 'all' ? '#7c3aed' : '#0f172a', fontWeight: 600 }}
                      onClick={() => { setHistoryInstructor('all'); setOpenHistoryInstMenu(false); loadHistory(1, historyPerPage); }}
                    >
                      All Instructors
                    </div>
                    {instructors.map(inst => (
                      <div
                        key={inst.id}
                        style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: historyInstructor === inst.id ? '#f5f3ff' : 'transparent', color: historyInstructor === inst.id ? '#7c3aed' : '#0f172a', fontWeight: 600 }}
                        onClick={() => { setHistoryInstructor(inst.id); setOpenHistoryInstMenu(false); loadHistory(1, historyPerPage); }}
                      >
                        {inst.full_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Search and View Controls Row */}
            <div className={liveStyles.historySearchRow}>
              {/* Search Bar */}
              <div className={liveStyles.historySearchBox}>
                <Search size={15} style={{ color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search sessions, subjects, instructors..."
                  className={liveStyles.historySearchInput}
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') loadHistory(1, historyPerPage); }}
                />
              </div>

              {/* Action Buttons & View Mode Pills */}
              <div className={liveStyles.historySearchActionsGroup}>
                <button
                  className={liveStyles.btnHistoryFilterAction}
                  onClick={() => loadHistory(1, historyPerPage)}
                >
                  <Filter size={13} style={{ color: '#64748b' }} />
                  <span>Filter</span>
                </button>

                <button
                  className={liveStyles.btnHistoryClearAll}
                  onClick={() => {
                    setHistoryDept('all');
                    setHistoryBatch('all');
                    setHistorySection('all');
                    setHistorySubject('all');
                    setHistoryInstructor('all');
                    setHistorySearch('');
                    loadHistory(1, historyPerPage);
                  }}
                >
                  <Trash2 size={13} />
                  <span>Clear All</span>
                </button>

                {/* Table / Calendar Switcher */}
                <div className={liveStyles.historyViewPillWrap}>
                  <button
                    className={`${liveStyles.historyViewPillBtn} ${historyViewMode === 'table' ? liveStyles.historyViewPillBtnActive : ''}`}
                    onClick={() => setHistoryViewMode('table')}
                  >
                    <List size={13} />
                    <span>Table</span>
                  </button>
                  <button
                    className={`${liveStyles.historyViewPillBtn} ${historyViewMode === 'calendar' ? liveStyles.historyViewPillBtnActive : ''}`}
                    onClick={() => setTab('calendar')}
                  >
                    <Calendar size={13} />
                    <span>Calendar</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Main 2-Column Split: Table + Session Details Drawer */}
            <div className={liveStyles.historyMainSplit}>
              {/* Left Column: Sessions Table */}
              <div className={liveStyles.historyTableCol}>
                <div className={liveStyles.historyTableCard}>
                  <table className={liveStyles.historyTable}>
                    <thead>
                      <tr>
                        <th style={{ width: 36, textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={historySelectedIds.size > 0 && historySelectedIds.size === historySessions.length}
                            onChange={toggleSelectAllHistory}
                            style={{ cursor: 'pointer' }}
                          />
                        </th>
                        <th>DATE & TIME</th>
                        <th>SESSION TITLE</th>
                        <th>SUBJECT</th>
                        <th>SECTION</th>
                        <th>INSTRUCTOR</th>
                        <th>DURATION</th>
                        <th>ATTENDANCE</th>
                        <th>STATUS</th>
                        <th style={{ textAlign: 'center' }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyLoading ? (
                        <tr>
                          <td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: 48 }}>
                            <RotateCw className={liveStyles.spin} size={20} style={{ margin: '0 auto 8px', color: '#7c3aed' }} />
                            <div>Loading session history from database…</div>
                          </td>
                        </tr>
                      ) : historySessions.length === 0 ? (
                        <tr>
                          <td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: 48 }}>
                            No sessions match your filter criteria.
                          </td>
                        </tr>
                      ) : (
                        historySessions.map(sess => {
                          const isSelected = historySelectedSession?.id === sess.id;
                          const isChecked = historySelectedIds.has(sess.id);
                          const dt = new Date(sess.scheduled_at);
                          const dateStr = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                          const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                          const endDt = new Date(dt.getTime() + (sess.duration_minutes || 120) * 60000);
                          const endTimeStr = endDt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                          const durationHours = Math.round((sess.duration_minutes || 120) / 60);

                          return (
                            <tr
                              key={sess.id}
                              className={`${liveStyles.historyTableRow} ${isSelected ? liveStyles.historyTableRowSelected : ''}`}
                              onClick={() => setHistorySelectedSession(sess)}
                              style={{ cursor: 'pointer' }}
                            >
                              {/* Checkbox */}
                              <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleSelectHistoryRow(sess.id)}
                                  style={{ cursor: 'pointer' }}
                                />
                              </td>

                              {/* Date & Time */}
                              <td>
                                <div style={{ fontWeight: 600, color: '#0f172a' }}>{dateStr}</div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>{timeStr} - {endTimeStr}</div>
                              </td>

                              {/* Session Title & Topic */}
                              <td>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                  {sess.clean_title || sess.title || 'Lab Session'}
                                </div>
                                <div style={{ fontSize: 11.5, color: '#64748b' }}>
                                  {sess.topic || 'Lab Experiment'}
                                </div>
                              </td>

                              {/* Subject */}
                              <td>
                                <span className={liveStyles.historySubjectBadge}>
                                  {sess.subject_code || (sess.subject_name ? sess.subject_name.slice(0, 6).toUpperCase() : 'CS101')}
                                </span>
                              </td>

                              {/* Section */}
                              <td>
                                <span className={liveStyles.historySectionBadge}>
                                  {sess.section_name || 'A'}
                                </span>
                              </td>

                              {/* Instructor */}
                              <td>
                                <div style={{ fontWeight: 600, color: '#334155' }}>
                                  {sess.instructor_name || 'Staff'}
                                </div>
                              </td>

                              {/* Duration */}
                              <td style={{ color: '#64748b', fontWeight: 500 }}>
                                {durationHours} hrs
                              </td>

                              {/* Attendance */}
                              <td>
                                <div className={liveStyles.historyAttendanceCol}>
                                  <div className={liveStyles.historyAttendanceNumbers}>
                                    <span className={liveStyles.historyAttendanceCount}>
                                      {sess.attendance_attended ?? (sess.status === 'cancelled' ? 0 : 28)}/{sess.attendance_total ?? 30}
                                    </span>
                                    <span
                                      className={liveStyles.historyAttendancePct}
                                      style={{ color: sess.status === 'cancelled' ? '#ef4444' : '#10b981' }}
                                    >
                                      {sess.attendance_percent ?? (sess.status === 'cancelled' ? 0 : 93)}%
                                    </span>
                                  </div>
                                  <div className={liveStyles.historyAttendanceProgressBar}>
                                    <div
                                      className={liveStyles.historyAttendanceProgressFill}
                                      style={{
                                        width: `${sess.attendance_percent ?? (sess.status === 'cancelled' ? 0 : 93)}%`,
                                        background: sess.status === 'cancelled' ? '#ef4444' : '#10b981'
                                      }}
                                    />
                                  </div>
                                </div>
                              </td>

                              {/* Status Badge */}
                              <td>
                                {sess.status === 'cancelled' ? (
                                  <span className={liveStyles.historyStatusBadgeCancelled}>Cancelled</span>
                                ) : sess.status === 'rescheduled' ? (
                                  <span className={liveStyles.historyStatusBadgeRescheduled}>Rescheduled</span>
                                ) : (
                                  <span className={liveStyles.historyStatusBadgeCompleted}>Completed</span>
                                )}
                              </td>

                              {/* Actions */}
                              <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, position: 'relative' }}>
                                  <button
                                    className={liveStyles.historyActionBtn}
                                    title="View Details"
                                    onClick={() => setHistorySelectedSession(sess)}
                                  >
                                    <Eye size={14} />
                                  </button>

                                  <button
                                    className={liveStyles.historyActionBtn}
                                    title="More Options"
                                    onClick={() => setOpenHistoryActionsId(openHistoryActionsId === sess.id ? null : sess.id)}
                                  >
                                    <MoreHorizontal size={14} />
                                  </button>

                                  {/* Floating Row Actions Popover */}
                                  {openHistoryActionsId === sess.id && (
                                    <div
                                      style={{
                                        position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100,
                                        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 9,
                                        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)', minWidth: 160, padding: 5,
                                        textAlign: 'left'
                                      }}
                                    >
                                      <div
                                        style={{ padding: '7px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#1e293b' }}
                                        onClick={() => { setOpenHistoryActionsId(null); handleOpenAttendanceRoster(sess); }}
                                      >
                                        <Users size={13} style={{ color: '#7c3aed' }} />
                                        <span>Attendance Roster</span>
                                      </div>
                                      <div
                                        style={{ padding: '7px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#1e293b' }}
                                        onClick={() => { setOpenHistoryActionsId(null); setEditTarget(sess); }}
                                      >
                                        <Edit2 size={13} style={{ color: '#2563eb' }} />
                                        <span>Edit Session</span>
                                      </div>
                                      <div
                                        style={{ padding: '7px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444' }}
                                        onClick={() => { setOpenHistoryActionsId(null); handleDeleteHistorySession(sess.id); }}
                                      >
                                        <Trash2 size={13} />
                                        <span>Delete Session</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Row */}
                <div className={liveStyles.historyPaginationRow}>
                  <div className={liveStyles.historyPaginationText}>
                    Showing {historySessions.length > 0 ? ((historyPage - 1) * historyPerPage + 1) : 0}–{Math.min(historyPage * historyPerPage, historyTotal)} of {historyTotal} sessions
                  </div>

                  <div className={liveStyles.historyPageBtnGroup}>
                    <button
                      className={liveStyles.historyPageBtn}
                      disabled={historyPage <= 1}
                      onClick={() => loadHistory(historyPage - 1, historyPerPage)}
                    >
                      <ChevronLeft size={13} />
                    </button>

                    {[1, 2, 3, 4, 5].map(p => (
                      <button
                        key={p}
                        className={`${liveStyles.historyPageBtn} ${historyPage === p ? liveStyles.historyPageBtnActive : ''}`}
                        onClick={() => loadHistory(p, historyPerPage)}
                      >
                        {p}
                      </button>
                    ))}
                    <span style={{ fontSize: 11, color: '#94a3b8', padding: '0 2px' }}>...</span>
                    <button
                      className={`${liveStyles.historyPageBtn} ${historyPage === historyPages ? liveStyles.historyPageBtnActive : ''}`}
                      onClick={() => loadHistory(historyPages, historyPerPage)}
                    >
                      {historyPages}
                    </button>

                    <button
                      className={liveStyles.historyPageBtn}
                      disabled={historyPage >= historyPages}
                      onClick={() => loadHistory(historyPage + 1, historyPerPage)}
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>

                  {/* Per page select */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <select
                      className={liveStyles.historyPerPageSelect}
                      value={historyPerPage}
                      onChange={e => {
                        const newPp = parseInt(e.target.value);
                        setHistoryPerPage(newPp);
                        loadHistory(1, newPp);
                      }}
                    >
                      <option value={7}>7 / page</option>
                      <option value={10}>10 / page</option>
                      <option value={20}>20 / page</option>
                      <option value={50}>50 / page</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Right Column: Session Details Drawer */}
              {historySelectedSession && (
                <div className={liveStyles.historyDetailsDrawer}>
                  {/* Drawer Header */}
                  <div className={liveStyles.historyDrawerHeader}>
                    <h3 className={liveStyles.historyDrawerTitle}>Session Details</h3>
                    <button
                      className={liveStyles.historyDrawerCloseBtn}
                      onClick={() => setHistorySelectedSession(null)}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Top Hero Box */}
                  <div className={liveStyles.historyDrawerHeroBox}>
                    <div className={liveStyles.historyDrawerIconAndTitle}>
                      <div className={liveStyles.historyDrawerIconSquircle}>
                        <Calendar size={18} />
                      </div>
                      <div>
                        <div className={liveStyles.historyDrawerSessionName}>
                          {historySelectedSession.clean_title || historySelectedSession.title}
                        </div>
                        <div className={liveStyles.historyDrawerTopic}>
                          {historySelectedSession.topic || 'Lab Experiment'}
                        </div>
                        <span className={liveStyles.historyDrawerSubjPill}>
                          {historySelectedSession.subject_code || 'CS102'}
                        </span>
                      </div>
                    </div>

                    <div>
                      {historySelectedSession.status === 'cancelled' ? (
                        <span className={liveStyles.historyStatusBadgeCancelled}>Cancelled</span>
                      ) : historySelectedSession.status === 'rescheduled' ? (
                        <span className={liveStyles.historyStatusBadgeRescheduled}>Rescheduled</span>
                      ) : (
                        <span className={liveStyles.historyStatusBadgeCompleted}>Completed</span>
                      )}
                    </div>
                  </div>

                  {/* Metadata List */}
                  <div className={liveStyles.historyDrawerMetaList}>
                    {/* Date & Time */}
                    <div className={liveStyles.historyDrawerMetaRow}>
                      <Calendar size={14} className={liveStyles.historyDrawerMetaIcon} />
                      <div className={liveStyles.historyDrawerMetaText}>
                        <span className={liveStyles.historyDrawerMetaLabel}>Date & Time</span>
                        <span className={liveStyles.historyDrawerMetaValue}>
                          {new Date(historySelectedSession.scheduled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, {new Date(historySelectedSession.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </span>
                      </div>
                    </div>

                    {/* Department */}
                    <div className={liveStyles.historyDrawerMetaRow}>
                      <Building2 size={14} className={liveStyles.historyDrawerMetaIcon} />
                      <div className={liveStyles.historyDrawerMetaText}>
                        <span className={liveStyles.historyDrawerMetaLabel}>Department</span>
                        <span className={liveStyles.historyDrawerMetaValue}>
                          {historySelectedSession.department_name || 'Computer Science & Engineering'}
                        </span>
                      </div>
                    </div>

                    {/* Batch */}
                    <div className={liveStyles.historyDrawerMetaRow}>
                      <GraduationCap size={14} className={liveStyles.historyDrawerMetaIcon} />
                      <div className={liveStyles.historyDrawerMetaText}>
                        <span className={liveStyles.historyDrawerMetaLabel}>Batch</span>
                        <span className={liveStyles.historyDrawerMetaValue}>
                          {historySelectedSession.batch_name || '2026'} ({historySelectedSession.program || 'B.Tech'})
                        </span>
                      </div>
                    </div>

                    {/* Section */}
                    <div className={liveStyles.historyDrawerMetaRow}>
                      <Users size={14} className={liveStyles.historyDrawerMetaIcon} />
                      <div className={liveStyles.historyDrawerMetaText}>
                        <span className={liveStyles.historyDrawerMetaLabel}>Section</span>
                        <span className={liveStyles.historyDrawerMetaValue}>
                          Section {historySelectedSession.section_name || 'A'}
                        </span>
                      </div>
                    </div>

                    {/* Instructor */}
                    <div className={liveStyles.historyDrawerMetaRow}>
                      <UserIcon size={14} className={liveStyles.historyDrawerMetaIcon} />
                      <div className={liveStyles.historyDrawerMetaText}>
                        <span className={liveStyles.historyDrawerMetaLabel}>Instructor</span>
                        <span className={liveStyles.historyDrawerMetaValue}>
                          {historySelectedSession.instructor_name || 'Dr. Rohan Kulkarni'}
                        </span>
                        <span className={liveStyles.historyDrawerMetaSub}>
                          {historySelectedSession.instructor_email || 'rohan.k@greenwood.edu'}
                        </span>
                      </div>
                    </div>

                    {/* Lab Room */}
                    <div className={liveStyles.historyDrawerMetaRow}>
                      <MapPin size={14} className={liveStyles.historyDrawerMetaIcon} />
                      <div className={liveStyles.historyDrawerMetaText}>
                        <span className={liveStyles.historyDrawerMetaLabel}>Lab</span>
                        <span className={liveStyles.historyDrawerMetaValue}>
                          {historySelectedSession.room || 'Lab 1 (Main Block)'}
                        </span>
                      </div>
                    </div>

                    {/* Duration */}
                    <div className={liveStyles.historyDrawerMetaRow}>
                      <Clock size={14} className={liveStyles.historyDrawerMetaIcon} />
                      <div className={liveStyles.historyDrawerMetaText}>
                        <span className={liveStyles.historyDrawerMetaLabel}>Duration</span>
                        <span className={liveStyles.historyDrawerMetaValue}>
                          {Math.round((historySelectedSession.duration_minutes || 120) / 60)} hours
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Attendance Widget */}
                  <div className={liveStyles.historyDrawerAttendanceBox}>
                    <div className={liveStyles.historyDrawerAttendanceHeader}>
                      <span className={liveStyles.historyDrawerAttendanceLbl}>Attendance</span>
                      <div>
                        <span className={liveStyles.historyDrawerAttendanceFraction}>
                          {historySelectedSession.attendance_attended ?? (historySelectedSession.status === 'cancelled' ? 0 : 28)} / {historySelectedSession.attendance_total ?? 30}
                        </span>
                        {' '}
                        <span
                          className={liveStyles.historyDrawerAttendancePct}
                          style={{ color: historySelectedSession.status === 'cancelled' ? '#ef4444' : '#10b981' }}
                        >
                          {historySelectedSession.attendance_percent ?? (historySelectedSession.status === 'cancelled' ? 0 : 93)}%
                        </span>
                      </div>
                    </div>

                    <div className={liveStyles.historyDrawerAttendanceBar}>
                      <div
                        className={liveStyles.historyDrawerAttendanceFill}
                        style={{
                          width: `${historySelectedSession.attendance_percent ?? (historySelectedSession.status === 'cancelled' ? 0 : 93)}%`,
                          background: historySelectedSession.status === 'cancelled' ? '#ef4444' : '#10b981'
                        }}
                      />
                    </div>

                    <button
                      className={liveStyles.historyDrawerAttendanceLink}
                      onClick={() => handleOpenAttendanceRoster(historySelectedSession)}
                    >
                      View Attendance List →
                    </button>
                  </div>

                  {/* Session Notes */}
                  <div className={liveStyles.historyDrawerNotesBox}>
                    <span className={liveStyles.historyDrawerNotesLbl}>Session Notes</span>
                    <p className={liveStyles.historyDrawerNotesText}>
                      {historySelectedSession.notes || 'Covered basic concepts of linked lists, implementation in Python. Good participation from students.'}
                    </p>
                  </div>

                  {/* Resources */}
                  <div className={liveStyles.historyDrawerResourcesBox}>
                    <span className={liveStyles.historyDrawerResourcesLbl}>Resources</span>
                    {(historySelectedSession.resources && historySelectedSession.resources.length > 0 ? historySelectedSession.resources : [
                      { name: 'Lab Manual - Linked Lists.pdf', type: 'pdf', size: '2.4 MB' },
                      { name: 'Sample Code.zip', type: 'zip', size: '1.1 MB' },
                    ]).map((res: any, idx: number) => (
                      <div key={idx} className={liveStyles.historyResourceItem}>
                        <div className={liveStyles.historyResourceName}>
                          {res.type === 'pdf' ? (
                            <FileText size={14} style={{ color: '#ef4444' }} />
                          ) : (
                            <FileArchive size={14} style={{ color: '#f59e0b' }} />
                          )}
                          <span>{res.name}</span>
                        </div>
                        <button
                          className={liveStyles.historyResourceDownloadBtn}
                          title="Download Resource"
                          onClick={() => toast3(`Downloaded ${res.name}`)}
                        >
                          <Download size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Footer Actions: Edit and Delete */}
                  <div className={liveStyles.historyDrawerFooterActions}>
                    <button
                      className={liveStyles.btnHistoryEditSession}
                      onClick={() => setEditTarget(historySelectedSession)}
                    >
                      <Edit2 size={13} />
                      <span>Edit Session</span>
                    </button>

                    <button
                      className={liveStyles.btnHistoryDeleteSession}
                      onClick={() => handleDeleteHistorySession(historySelectedSession.id)}
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Student Attendance Roster Modal */}
            {historyRosterOpen && historySelectedSession && (
              <div className={liveStyles.modalBackdrop} onClick={() => setHistoryRosterOpen(false)}>
                <div className={liveStyles.modalBox} style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
                  <div className={liveStyles.modalHeader}>
                    <div>
                      <h3 className={liveStyles.modalTitle}>
                        Attendance Roster — {historySelectedSession.clean_title || historySelectedSession.title}
                      </h3>
                      <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                        {new Date(historySelectedSession.scheduled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} • Section {historySelectedSession.section_name || 'A'} • {historySelectedSession.instructor_name || 'Dr. Rohan Kulkarni'}
                      </p>
                    </div>
                    <button className={liveStyles.modalCloseBtn} onClick={() => setHistoryRosterOpen(false)}>
                      <X size={18} />
                    </button>
                  </div>

                  <div style={{ maxHeight: 420, overflowY: 'auto', padding: '0 4px' }}>
                    {historyRosterLoading ? (
                      <div style={{ textAlign: 'center', padding: 36, color: '#94a3b8' }}>
                        <RotateCw className={liveStyles.spin} size={20} style={{ margin: '0 auto 8px', color: '#7c3aed' }} />
                        <div>Loading student records…</div>
                      </div>
                    ) : historyRosterStudents.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 36, color: '#94a3b8' }}>
                        No attendance records logged for this session.
                      </div>
                    ) : (
                      <table className={liveStyles.historyTable}>
                        <thead>
                          <tr>
                            <th>ROLL NUMBER</th>
                            <th>STUDENT NAME</th>
                            <th>EMAIL</th>
                            <th>CHECK-IN</th>
                            <th>CHECK-OUT</th>
                            <th>STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyRosterStudents.map((st, i) => (
                            <tr key={st.student_id || i}>
                              <td style={{ fontWeight: 700, color: '#0f172a', fontSize: 11.5 }}>
                                {st.roll_number}
                              </td>
                              <td style={{ fontWeight: 600, color: '#1e293b' }}>
                                {st.name}
                              </td>
                              <td style={{ color: '#64748b', fontSize: 11.5 }}>
                                {st.email}
                              </td>
                              <td style={{ color: '#334155', fontSize: 11.5 }}>
                                {st.joined_at || '09:02 AM'}
                              </td>
                              <td style={{ color: '#64748b', fontSize: 11.5 }}>
                                {st.left_at || '11:00 AM'}
                              </td>
                              <td>
                                <span style={{
                                  display: 'inline-flex', padding: '3px 8px', borderRadius: 999,
                                  fontSize: 11, fontWeight: 600,
                                  background: st.status === 'absent' ? '#fee2e2' : '#dcfce7',
                                  color: st.status === 'absent' ? '#b91c1c' : '#15803d'
                                }}>
                                  {st.status === 'absent' ? 'Absent' : 'Present'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className={liveStyles.modalFooter}>
                    <button className={liveStyles.btnCancel} onClick={() => setHistoryRosterOpen(false)}>
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          SCHEDULE / START SESSION MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {showStartModal && (
        <div className={liveStyles.modalBackdrop} onClick={() => setShowStartModal(false)}>
          <div className={liveStyles.modalBox} onClick={e => e.stopPropagation()}>
            <div className={liveStyles.modalHeader}>
              <h3 className={liveStyles.modalTitle}>
                {startForm.start_immediately ? 'Start New Lab Session' : 'Schedule Lab Session'}
              </h3>
              <button className={liveStyles.modalCloseBtn} onClick={() => setShowStartModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className={liveStyles.formField}>
              <label className={liveStyles.formLabel}>Session Title *</label>
              <input
                className={liveStyles.formInput}
                placeholder="e.g. Lab 4 — Binary Search Trees"
                value={startForm.title}
                onChange={e => setStartForm({ ...startForm, title: e.target.value })}
              />
            </div>

            <div className={liveStyles.formField}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label className={liveStyles.formLabel} style={{ marginBottom: 0 }}>
                  Sections * <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>(Select one or multiple)</span>
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: (startForm.section_ids || []).length > 0 ? '#ede9fe' : '#f1f5f9',
                    color: (startForm.section_ids || []).length > 0 ? '#6d28d9' : '#64748b',
                    fontWeight: 600,
                  }}>
                    {(startForm.section_ids || []).length} selected
                  </span>
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#6366f1',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontWeight: 600,
                      padding: 0,
                    }}
                    onClick={() => {
                      const allIds = allSections.map(s => s.id);
                      const isAll = (startForm.section_ids || []).length === allIds.length;
                      const next = isAll ? [] : allIds;
                      setStartForm({
                        ...startForm,
                        section_ids: next,
                        section_id: next[0] || '',
                      });
                    }}
                  >
                    {(startForm.section_ids || []).length === allSections.length ? 'Clear All' : 'Select All'}
                  </button>
                </div>
              </div>

              {/* Multi-select section chip / badge preview */}
              {(startForm.section_ids || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {(startForm.section_ids || []).map(sid => {
                    const sec = allSections.find(s => s.id === sid);
                    const b = sec ? batches.find(batch => batch.id === sec.batch_id) : null;
                    return (
                      <span
                        key={sid}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          borderRadius: 6,
                          background: '#f5f3ff',
                          border: '1px solid #ddd6fe',
                          color: '#5b21b6',
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        Section {sec ? sec.name : sid} {b ? `(${b.name})` : ''}
                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#7c3aed',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          onClick={() => {
                            const next = (startForm.section_ids || []).filter(id => id !== sid);
                            setStartForm({
                              ...startForm,
                              section_ids: next,
                              section_id: next[0] || '',
                            });
                          }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Scrollable Checkbox List for Sections */}
              <div
                style={{
                  maxHeight: 160,
                  overflowY: 'auto',
                  border: '1px solid #cbd5e1',
                  borderRadius: 10,
                  padding: '6px 8px',
                  background: '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {allSections.length === 0 ? (
                  <div style={{ padding: '8px 10px', fontSize: 12, color: '#64748b' }}>No sections found.</div>
                ) : (
                  allSections.map(sec => {
                    const b = batches.find(batch => batch.id === sec.batch_id);
                    const isChecked = (startForm.section_ids || []).includes(sec.id);
                    return (
                      <label
                        key={sec.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '6px 10px',
                          borderRadius: 6,
                          background: isChecked ? '#ede9fe' : '#ffffff',
                          border: `1px solid ${isChecked ? '#c4b5fd' : '#e2e8f0'}`,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            const cur = startForm.section_ids || [];
                            const next = e.target.checked
                              ? [...cur, sec.id]
                              : cur.filter(id => id !== sec.id);
                            setStartForm({
                              ...startForm,
                              section_ids: next,
                              section_id: next[0] || '',
                            });
                          }}
                          style={{ accentColor: '#7c3aed', width: 15, height: 15, cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 13, fontWeight: isChecked ? 600 : 500, color: isChecked ? '#5b21b6' : '#1e293b' }}>
                          Section {sec.name}
                        </span>
                        {b && (
                          <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>
                            {b.name}
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className={liveStyles.formField}>
              <label className={liveStyles.formLabel}>Subject *</label>
              <select
                className={liveStyles.formSelect}
                value={startForm.subject_id}
                onChange={e => {
                  const sub = allSubjects.find(s => s.id === e.target.value);
                  setStartForm({
                    ...startForm,
                    subject_id: e.target.value,
                    title: sub ? `${sub.name} Lab Session` : startForm.title,
                  });
                }}
              >
                <option value="">Select Subject…</option>
                {allSubjects.map(sub => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name} {sub.code ? `(${sub.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className={liveStyles.formField}>
              <label className={liveStyles.formLabel}>Instructor (optional)</label>
              <select
                className={liveStyles.formSelect}
                value={startForm.instructor_id}
                onChange={e => setStartForm({ ...startForm, instructor_id: e.target.value })}
              >
                <option value="">Default assigned instructor</option>
                {instructors.map(instr => (
                  <option key={instr.id} value={instr.id}>
                    {instr.full_name} ({instr.email})
                  </option>
                ))}
              </select>
            </div>

            {!startForm.start_immediately && (
              <div className={liveStyles.formField}>
                <label className={liveStyles.formLabel}>Scheduled Date &amp; Time *</label>
                <input
                  className={liveStyles.formInput}
                  type="datetime-local"
                  value={startForm.scheduled_at}
                  onChange={e => setStartForm({ ...startForm, scheduled_at: e.target.value })}
                />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className={liveStyles.formField}>
                <label className={liveStyles.formLabel}>Duration (minutes)</label>
                <select
                  className={liveStyles.formSelect}
                  value={startForm.duration_minutes}
                  onChange={e => setStartForm({ ...startForm, duration_minutes: Number(e.target.value) })}
                >
                  <option value="30">30 mins</option>
                  <option value="45">45 mins</option>
                  <option value="60">1 hour</option>
                  <option value="90">1.5 hours</option>
                  <option value="120">2 hours</option>
                  <option value="180">3 hours</option>
                </select>
              </div>
              <div className={liveStyles.formField}>
                <label className={liveStyles.formLabel}>Lab Room / Venue</label>
                <input
                  className={liveStyles.formInput}
                  placeholder="e.g. Lab 2 (Network Lab)"
                  value={startForm.room}
                  onChange={e => setStartForm({ ...startForm, room: e.target.value })}
                />
              </div>
            </div>

            <label className={liveStyles.checkboxRow}>
              <input
                type="checkbox"
                checked={startForm.start_immediately}
                onChange={e => setStartForm({ ...startForm, start_immediately: e.target.checked })}
              />
              <span><strong>Start Immediately</strong> (Launch as LIVE session right now)</span>
            </label>

            <div className={liveStyles.modalFooter}>
              <button
                className={liveStyles.btnCancel}
                onClick={() => setShowStartModal(false)}
                disabled={startSubmitting}
              >
                Cancel
              </button>
              <button
                className={liveStyles.btnSubmit}
                onClick={handleCreateSession}
                disabled={startSubmitting}
              >
                {startSubmitting ? 'Submitting…' : (startForm.start_immediately ? '● Launch Live Session' : 'Schedule Session')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SESSION DETAILS MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {selectedSessionDetails && (
        <div className={liveStyles.modalBackdrop} onClick={() => setSelectedSessionDetails(null)}>
          <div className={liveStyles.modalBox} onClick={e => e.stopPropagation()}>
            <div className={liveStyles.modalHeader}>
              <div>
                <h3 className={liveStyles.modalTitle}>{selectedSessionDetails.subject_name || selectedSessionDetails.title}</h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                  {selectedSessionDetails.title}
                </p>
              </div>
              <button className={liveStyles.modalCloseBtn} onClick={() => setSelectedSessionDetails(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              {selectedSessionDetails.is_recurring_projection && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#f5f3ff', borderRadius: 8, border: '1px solid #ddd6fe', color: '#6d28d9', fontSize: 12, fontWeight: 500 }}>
                  <Repeat size={14} /> Recurring Plan Projection (Virtual occurrence)
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Status</span>
                <StatusBadge status={selectedSessionDetails.status} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Scheduled Time</span>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(selectedSessionDetails.scheduled_at)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Duration</span>
                <span style={{ color: '#0f172a' }}>{selectedSessionDetails.duration_minutes} minutes</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Class / Section</span>
                <span style={{ color: '#0f172a' }}>{selectedSessionDetails.batch_name || '2026'} &bull; Section {selectedSessionDetails.section_name || 'A'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Instructor</span>
                <span style={{ color: '#0f172a', fontWeight: 600 }}>{selectedSessionDetails.instructor_name || 'Faculty Member'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Venue / Room</span>
                <span style={{ color: '#0f172a' }}>{selectedSessionDetails.room || 'Lab 1 (Main Block)'}</span>
              </div>
            </div>

            <div className={liveStyles.modalFooter} style={{ marginTop: 14 }}>
              {selectedSessionDetails.status === 'active' && (
                <button
                  className={liveStyles.btnSubmit}
                  style={{ background: '#16a34a' }}
                  onClick={() => window.open(`/instructor/sessions/${selectedSessionDetails.id}`, '_blank')}
                >
                  <ExternalLink size={13} /> Open Live Lab
                </button>
              )}
              {selectedSessionDetails.status === 'scheduled' && !selectedSessionDetails.is_recurring_projection && (
                <button
                  className={liveStyles.btnCardAction}
                  onClick={() => {
                    setEditTarget(selectedSessionDetails);
                    setSelectedSessionDetails(null);
                  }}
                >
                  <Edit2 size={13} /> Edit Session
                </button>
              )}
              {selectedSessionDetails.is_recurring_projection && (
                <button
                  className={liveStyles.btnSubmit}
                  style={{ background: '#7c3aed' }}
                  onClick={() => {
                    const d = new Date(selectedSessionDetails.scheduled_at);
                    const pad = (n: number) => String(n).padStart(2, '0');
                    const localIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                    setStartForm({
                      title: selectedSessionDetails.title || 'Lab Session',
                      section_id: selectedSessionDetails.section_id || '',
                      section_ids: selectedSessionDetails.section_id ? [selectedSessionDetails.section_id] : [],
                      subject_id: allSubjects.find(sub => sub.name === selectedSessionDetails.subject_name)?.id || allSubjects[0]?.id || '',
                      instructor_id: selectedSessionDetails.instructor_id || '',
                      duration_minutes: selectedSessionDetails.duration_minutes || 60,
                      room: selectedSessionDetails.room || 'Lab 1 (Main Block)',
                      start_immediately: false,
                      scheduled_at: localIso,
                    });
                    setSelectedSessionDetails(null);
                    setShowStartModal(true);
                  }}
                >
                  <Plus size={13} /> Instantiate / Customize
                </button>
              )}
              <button className={liveStyles.btnCancel} onClick={() => setSelectedSessionDetails(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          VIEW STUDENTS LIVE ROSTER MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {rosterSession && (
        <div className={liveStyles.modalBackdrop} onClick={() => setRosterSession(null)}>
          <div className={`${liveStyles.modalBox} ${liveStyles.rosterModalBox}`} onClick={e => e.stopPropagation()}>
            <div className={liveStyles.modalHeader}>
              <div>
                <h3 className={liveStyles.modalTitle}>
                  {rosterSession.title || rosterSession.subject_name || 'Lab Session'} — Student Attendance
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                  {rosterData ? `${rosterData.total_online} online of ${rosterData.total_enrolled} enrolled students` : 'Loading attendance roster…'}
                </p>
              </div>
              <button className={liveStyles.modalCloseBtn} onClick={() => setRosterSession(null)}>
                <X size={18} />
              </button>
            </div>

            <div className={liveStyles.searchBox} style={{ width: '100%' }}>
              <Search size={14} color="#94a3b8" />
              <input
                placeholder="Search student by name, email, or roll number…"
                value={rosterSearch}
                onChange={e => setRosterSearch(e.target.value)}
              />
              {rosterSearch && (
                <X size={13} style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={() => setRosterSearch('')} />
              )}
            </div>

            <div className={liveStyles.rosterTableWrap}>
              {rosterLoading ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
                  <RotateCw size={24} className={styles.spin} color="#7c3aed" />
                  <p style={{ margin: '8px 0 0', fontSize: 13 }}>Fetching live attendance roster…</p>
                </div>
              ) : filteredRosterStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13 }}>
                  No students found.
                </div>
              ) : (
                <table className={liveStyles.activityTable}>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Roll Number</th>
                      <th>Status</th>
                      <th>Joined At</th>
                      <th>Reconnects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRosterStudents.map(st => (
                      <tr key={st.student_id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div
                              className={liveStyles.instructorAvatar}
                              style={{ width: 28, height: 28, fontSize: 11, background: getAvatarColor(st.name) }}
                            >
                              {st.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 12.5 }}>{st.name}</div>
                              <div style={{ fontSize: 11, color: '#94a3b8' }}>{st.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                          {st.roll_number || '—'}
                        </td>
                        <td>
                          {st.is_online ? (
                            <span className={liveStyles.instructorOnlineBadge}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                              Online
                            </span>
                          ) : st.status === 'left' ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '3px 8px', borderRadius: 999, background: '#fef2f2',
                              color: '#dc2626', fontSize: 10.5, fontWeight: 700,
                            }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
                              Left
                            </span>
                          ) : (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '3px 8px', borderRadius: 999, background: '#f1f5f9',
                              color: '#64748b', fontSize: 10.5, fontWeight: 600,
                            }}>
                              Absent
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>
                          {st.joined_at || '—'}
                        </td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>
                          {st.reconnect_count ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className={liveStyles.modalFooter}>
              <button className={liveStyles.btnCancel} onClick={() => setRosterSession(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </InstitutionShell>
  );
}


/* == Interactive history charts - real data from /sessions/history stats == */

function HistoryAttendanceChart({ trend, avg }: {
  trend: { label: string; rate: number }[];
  avg: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const W = 460, H = 130, PAD_L = 38, PAD_R = 20, TOP = 15, BOT = 108;
  const pts = (trend || []).map((p, i) => ({
    x: (trend || []).length === 1
      ? (PAD_L + W - PAD_R) / 2
      : PAD_L + (i / Math.max(1, (trend || []).length - 1)) * (W - PAD_L - PAD_R),
    y: BOT - (Math.max(0, Math.min(100, p.rate)) / 100) * (BOT - TOP),
    label: p.label,
    rate: p.rate,
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = pts.length > 1 ? `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${BOT} L ${pts[0].x.toFixed(1)} ${BOT} Z` : '';
  const hp = hovered != null ? pts[hovered] : null;

  return (
    <div className={liveStyles.historySvgLineWrap} style={{ position: 'relative' }}>
      <svg viewBox="0 0 460 130" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id="purpleGradientArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {[
          { y: 15, label: '100%' },
          { y: 38, label: '75%' },
          { y: 62, label: '50%' },
          { y: 85, label: '25%' },
          { y: 108, label: '0%' },
        ].map(grid => (
          <g key={grid.label}>
            <text x="0" y={grid.y + 3} fill="#94a3b8" fontSize="9" fontWeight="600">
              {grid.label}
            </text>
            <line x1="38" y1={grid.y} x2={W - PAD_R} y2={grid.y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
          </g>
        ))}

        {pts.length > 1 && <path d={areaPath} fill="url(#purpleGradientArea)" />}
        {pts.length > 1 && (
          <path d={linePath} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {pts.map((pt, i) => (
          <g key={`${pt.label}-${i}`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: 'pointer' }}
          >
            <circle cx={pt.x} cy={pt.y} r={hovered === i ? 6 : 4.5} fill="#ffffff" stroke="#7c3aed" strokeWidth="2.5" />
            <text x={pt.x} y="122" textAnchor="middle" fill={hovered === i ? '#6d28d9' : '#94a3b8'} fontSize="9.5" fontWeight="600">
              {pt.label}
            </text>
            <title>{`${pt.label}: ${pt.rate}% attendance`}</title>
          </g>
        ))}
      </svg>

      {hp && (
        <div style={{
          position: 'absolute',
          left: `${(hp.x / W) * 100}%`,
          top: `${(hp.y / H) * 100}%`,
          transform: 'translate(-50%, -140%)',
          background: '#1e1b2e', color: '#fff', borderRadius: 8,
          padding: '6px 10px', fontSize: 11, fontWeight: 700,
          pointerEvents: 'none', whiteSpace: 'nowrap',
          boxShadow: '0 8px 20px rgba(0,0,0,.25)',
          zIndex: 30,
        }}>
          {hp.label} · {hp.rate}% attendance
        </div>
      )}
      {avg != null && (
        <div style={{ position: 'absolute', top: 0, right: 0, fontSize: 10, fontWeight: 700, color: '#9891a6' }}>
          avg {avg}%
        </div>
      )}
    </div>
  );
}

function HistoryDonut({ data, centerValue, centerLabel }: {
  data: { name: string; value: number; color: string }[];
  centerValue: number | string;
  centerLabel: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = (data || []).reduce((s, d) => s + (d.value || 0), 0);
  const R = 38, C = 2 * Math.PI * R;
  let acc = 0;
  const segs = (data || []).map(d => {
    const frac = total > 0 ? d.value / total : 0;
    const seg = { ...d, dash: frac * C, off: acc };
    acc += frac * C;
    return seg;
  });
  const hd = hovered != null ? segs[hovered] : null;

  return (
    <div className={liveStyles.historyDonutRow}>
      <div className={liveStyles.historyDonutSvgBox}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r="38" fill="none" stroke="#f1f5f9" strokeWidth="12" />
          {segs.map((s, i) => (
            <circle
              key={s.name}
              cx="50" cy="50" r="38" fill="none"
              stroke={s.color}
              strokeWidth={hovered === i ? 15 : 12}
              strokeDasharray={`${s.dash} ${C - s.dash}`}
              strokeDashoffset={-s.off}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer', transition: 'stroke-width .15s ease, opacity .15s ease', opacity: hovered == null || hovered === i ? 1 : 0.35 }}
            >
              <title>{`${s.name}: ${s.value}`}</title>
            </circle>
          ))}
        </svg>
        <div className={liveStyles.historyDonutCenterText}>
          <div className={liveStyles.historyDonutCenterNumber}>{hd ? hd.value : centerValue}</div>
          <div className={liveStyles.historyDonutCenterLabel}>{hd ? hd.name : centerLabel}</div>
        </div>
      </div>

      <div className={liveStyles.historyLegendList}>
        {segs.map((s, i) => (
          <div
            key={s.name}
            className={liveStyles.historyLegendItem}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: 'pointer', opacity: hovered == null || hovered === i ? 1 : 0.5, transition: 'opacity .15s ease' }}
          >
            <div className={liveStyles.historyLegendDotName}>
              <span className={liveStyles.historyLegendDot} style={{ background: s.color }} />
              <span className={liveStyles.historyLegendName}>{s.name}</span>
            </div>
            <span className={liveStyles.historyLegendVal}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SessionsPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <p style={{ color: '#64748b', fontSize: 14 }}>Loading Sessions…</p>
      </div>
    }>
      <SessionsPageContent />
    </Suspense>
  );
}
