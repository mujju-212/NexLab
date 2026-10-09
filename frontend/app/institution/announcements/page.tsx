'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService } from '@/services/institution.service';
import {
  Megaphone, Send, Clock, Eye, Users, FileText, CheckCircle2,
  Calendar, AlertCircle, Plus, Paperclip, X, Search, Filter,
  BarChart3, Settings, ChevronRight, ThumbsUp, Check, Bold,
  Italic, Underline, List, ListOrdered, Link as LinkIcon, Image as ImageIcon,
  Maximize2, ArrowUpRight, ShieldAlert, Sparkles, Loader2, RefreshCw, Trash2
} from 'lucide-react';
import styles from './announcements.module.css';

interface StatData {
  total_announcements: number;
  new_this_month: number;
  students_reached: number;
  delivery_rate_pct: number;
  total_views: number;
  open_rate_pct: number;
  scheduled_count: number;
  drafts_count: number;
}

interface AnnouncementItem {
  id: string;
  title: string;
  message: string;
  priority: 'normal' | 'important' | 'urgent';
  category: 'general' | 'cancellation' | 'schedule' | 'exam' | 'event';
  target: 'all' | 'students' | 'instructors' | 'custom';
  department_id?: string | null;
  academic_year?: number | null;
  batch_id?: string | null;
  section_id?: string | null;
  attachment_name?: string | null;
  attachment_url?: string | null;
  attachment_size?: string | null;
  status: 'sent' | 'scheduled' | 'draft';
  send_at?: string | null;
  sent_at?: string | null;
  created_at: string;
  reach_count: number;
  views_count: number;
  likes_count: number;
  open_rate_pct: number;
  audience_label?: string;
  readers?: Array<{
    user_id: string;
    user_name: string;
    user_role: string;
    read_at: string | null;
    liked: boolean;
  }>;
}

export default function AnnouncementsPage() {
  const queryClient = useQueryClient();

  // Stats
  const [stats, setStats] = useState<StatData>({
    total_announcements: 0,
    new_this_month: 0,
    students_reached: 0,
    delivery_rate_pct: 100,
    total_views: 0,
    open_rate_pct: 0,
    scheduled_count: 0,
    drafts_count: 0,
  });

  // Active Tab: 'create' | 'scheduled' | 'sent' | 'drafts' | 'templates'
  const [activeTab, setActiveTab] = useState<'create' | 'scheduled' | 'sent' | 'drafts' | 'templates'>('create');

  // Form State
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<'all' | 'students' | 'instructors' | 'custom'>('all');
  const [priority, setPriority] = useState<'normal' | 'important' | 'urgent'>('important');
  const [category, setCategory] = useState<'general' | 'cancellation' | 'schedule' | 'exam' | 'event'>('cancellation');

  // Targeting Cascades
  const [departments, setDepartments] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);

  const [selectedDept, setSelectedDept] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedSection, setSelectedSection] = useState('');

  // Attachment
  const [attachment, setAttachment] = useState<{ name: string; url: string; size: string } | null>({
    name: 'Lab_Guidelines.pdf',
    url: '/static/uploads/announcements/Lab_Guidelines.pdf',
    size: '2.4 MB',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scheduling
  const [isScheduled, setIsScheduled] = useState(false);
  const [sendAtLocal, setSendAtLocal] = useState('');

  // Table & List State
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'scheduled' | 'draft'>('all');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Preview Role Toggle
  const [previewRole, setPreviewRole] = useState<'student' | 'instructor'>('student');

  // Modals
  const [detailModalItem, setDetailModalItem] = useState<AnnouncementItem | null>(null);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Load Data — through the react-query cache. Mutations call these with
  // fresh=true so the cached copy is dropped first; simple revisits render
  // from cache instantly.
  const loadStats = async (fresh = false) => {
    try {
      if (fresh) queryClient.removeQueries({ queryKey: ['institution', 'announcements', 'stats'] });
      const data = await queryClient.fetchQuery({
        queryKey: ['institution', 'announcements', 'stats'],
        queryFn: () => institutionService.getAnnouncementStats(),
        staleTime: 30 * 1000,
      });
      setStats(data);
    } catch {
      // keep fallback
    }
  };

  const loadAnnouncements = async (statusOverride?: string, fresh = false) => {
    setLoading(true);
    try {
      const currentStatus = statusOverride ?? (activeTab === 'create' ? 'all' : activeTab);
      const status = currentStatus === 'templates' ? 'all' : currentStatus;
      if (fresh) {
        queryClient.removeQueries({ queryKey: ['institution', 'announcements', 'list'] });
      }
      const res = await queryClient.fetchQuery({
        queryKey: ['institution', 'announcements', 'list', status, searchQuery],
        queryFn: () => institutionService.listAnnouncements({
          status,
          search: searchQuery || undefined,
        }),
        staleTime: 15 * 1000,
      });
      setAnnouncements(res.announcements);
    } catch {
      // keep fallback
    } finally {
      setLoading(false);
    }
  };

  // Preload academic structure — same cached reference data the other pages
  // use (shared keys: departments here is the same list as the users page).
  useEffect(() => {
    loadStats();
    loadAnnouncements();

    queryClient.fetchQuery({
      queryKey: ['institution', 'departments'],
      queryFn: () => institutionService.listDepartments(),
      staleTime: 5 * 60 * 1000,
    }).then(setDepartments).catch(() => {});
    queryClient.fetchQuery({
      queryKey: ['institution', 'academic-years'],
      queryFn: () => institutionService.getAcademicYears(),
      staleTime: 5 * 60 * 1000,
    }).then(ys => {
      setYears(ys);
      const active = ys.find((y: any) => y.is_active);
      if (active) {
        setSelectedYear(String(active.year_label).slice(0, 4));
        institutionService.getBatches(active.id).then(setBatches).catch(() => {});
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle Tab Switch
  const handleTabClick = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab === 'scheduled') loadAnnouncements('scheduled');
    else if (tab === 'sent') loadAnnouncements('sent');
    else if (tab === 'drafts') loadAnnouncements('drafts');
    else loadAnnouncements('all');
  };

  const onYearChange = async (yearLabel: string) => {
    setSelectedYear(yearLabel);
    setSelectedBatch('');
    setSelectedSection('');
    setSections([]);
    if (!yearLabel) { setBatches([]); return; }
    const year = years.find((y: any) => String(y.year_label).slice(0, 4) === yearLabel);
    setBatches(year ? await institutionService.getBatches(year.id).catch(() => []) : []);
  };

  const onBatchChange = async (batchId: string) => {
    setSelectedBatch(batchId);
    setSelectedSection('');
    setSections(batchId ? await institutionService.getSections(batchId).catch(() => []) : []);
  };

  // Quick Template Selection
  const applyTemplate = (type: 'cancellation' | 'schedule' | 'exam' | 'general') => {
    if (type === 'cancellation') {
      setTitle('Lab Cancelled Tomorrow');
      setMessage("Tomorrow's Data Structures lab (Section A) has been cancelled due to maintenance. The revised schedule will be shared soon. Apologies for the inconvenience.");
      setCategory('cancellation');
      setPriority('important');
      setAttachment({
        name: 'Lab_Guidelines.pdf',
        url: '/static/uploads/announcements/Lab_Guidelines.pdf',
        size: '2.4 MB',
      });
      showToast('Loaded "Lab Cancellation" template.');
    } else if (type === 'schedule') {
      setTitle('Schedule Update: Revised Lab Timings');
      setMessage('Please note that all practical laboratory sessions will start 15 minutes earlier starting next week. Verify your updated slot allocations on the portal.');
      setCategory('schedule');
      setPriority('normal');
      setAttachment(null);
      showToast('Loaded "Schedule Update" template.');
    } else if (type === 'exam') {
      setTitle('Mid-Sem Practical Examination Guidelines');
      setMessage('Please review the examination rubric, test-case requirements, and assigned workstation numbers. The anti-collusion proctoring system will be active.');
      setCategory('exam');
      setPriority('important');
      setAttachment({
        name: 'MidSem_Timetable_2026.pdf',
        url: '/static/uploads/announcements/MidSem_Timetable_2026.pdf',
        size: '1.8 MB',
      });
      showToast('Loaded "Exam Notice" template.');
    } else {
      setTitle('General Notice: Compiler Cloud Environment Upgrade');
      setMessage('All compiler runner sandboxes have been upgraded with latest language runtimes and updated package repositories. Contact the lab technician for any questions.');
      setCategory('general');
      setPriority('normal');
      setAttachment(null);
      showToast('Loaded "General Notice" template.');
    }
  };

  // File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await institutionService.uploadAnnouncementFile(file);
      setAttachment({ name: res.filename, url: res.url, size: res.size });
      showToast(`Uploaded ${res.filename}`);
    } catch {
      // client fallback preview
      setAttachment({
        name: file.name,
        url: URL.createObjectURL(file),
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      });
      showToast(`Attached ${file.name}`);
    }
  };

  // Submit / Send Announcement
  const handleSend = async (saveAsDraft = false) => {
    if (!title.trim()) {
      showToast('Please enter an announcement title.');
      return;
    }
    if (!message.trim() && !saveAsDraft) {
      showToast('Please enter the announcement message.');
      return;
    }

    setSending(true);
    try {
      const statusValue = saveAsDraft ? 'draft' : (isScheduled ? 'scheduled' : 'sent');
      let sendAtIso: string | undefined = undefined;

      if (isScheduled && !saveAsDraft) {
        if (!sendAtLocal) {
          showToast('Please choose a delivery date and time.');
          setSending(false);
          return;
        }
        const when = new Date(sendAtLocal);
        if (isNaN(when.getTime()) || when.getTime() <= Date.now()) {
          showToast('Scheduled delivery must be in the future.');
          setSending(false);
          return;
        }
        sendAtIso = when.toISOString();
      }

      const res = await institutionService.createAnnouncement({
        title: title.trim(),
        message: message.trim(),
        priority,
        category,
        target,
        department_id: selectedDept || undefined,
        academic_year: selectedYear ? Number(selectedYear) : undefined,
        batch_id: selectedBatch || undefined,
        section_id: selectedSection || undefined,
        attachment_name: attachment?.name,
        attachment_url: attachment?.url,
        attachment_size: attachment?.size,
        status: statusValue,
        send_at: sendAtIso,
      });

      if (saveAsDraft) {
        showToast('Announcement saved to Drafts.');
      } else if (isScheduled) {
        showToast('Announcement scheduled successfully.');
      } else {
        showToast(`Announcement sent to ${res.sent_to || 'recipients'}.`);
      }

      // Reset form
      setTitle('');
      setMessage('');
      setIsScheduled(false);
      setSendAtLocal('');
      loadStats(true);
      loadAnnouncements(undefined, true);
    } catch {
      showToast('Failed to create announcement. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Delete Announcement
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      await institutionService.deleteAnnouncement(id);
      showToast('Announcement deleted.');
      loadStats(true);
      loadAnnouncements(undefined, true);
    } catch {
      showToast('Could not delete announcement.');
    }
  };

  // View Details Modal — per-id cache entry; the list stays untouched.
  const openDetails = async (item: AnnouncementItem) => {
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ['institution', 'announcements', 'details', item.id],
        queryFn: () => institutionService.getAnnouncementDetails(item.id),
        staleTime: 30 * 1000,
      });
      setDetailModalItem(data.announcement);
    } catch {
      setDetailModalItem(item);
    }
  };

  // Filtered Table Items
  const filteredAnnouncements = useMemo(() => {
    return announcements.filter(item => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches = item.title.toLowerCase().includes(q) || item.message.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [announcements, searchQuery, statusFilter]);

  return (
    <InstitutionShell activePage="Announcements">
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1100,
          background: '#1a1528', color: '#fff', padding: '12px 22px',
          borderRadius: 12, fontSize: 13.5, fontWeight: 600,
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          <Sparkles size={16} color="#c084fc" />
          {toast}
        </div>
      )}

      <div className={styles.pageContainer}>
        {/* ── Top Header Banner ── */}
        <div className={styles.topHeader}>
          <div className={styles.titleGroup}>
            <h1 className={styles.pageTitle}>Announcements</h1>
            <p className={styles.pageSubtitle}>
              Keep your students and instructors informed with important updates, schedules, and alerts.
            </p>
          </div>

          <div className={styles.heroBanner}>
            <div className={styles.heroIconWrap}>
              <Megaphone size={22} strokeWidth={2.2} />
            </div>
            <div className={styles.heroContent}>
              <p className={styles.heroHeadline}>Communicate. Engage. Keep Everyone Updated.</p>
              <p className={styles.heroDescription}>
                Send targeted announcements to specific departments, batches, sections or everyone.
              </p>
            </div>
          </div>
        </div>

        {/* ── Metric Stat Cards Bar ── */}
        <div className={styles.statsRow}>
          {/* Card 1: Total Announcements */}
          <div className={styles.statCard}>
            <div className={styles.statIconWrap} style={{ background: '#faf5ff', color: '#9333ea' }}>
              <Send size={20} />
            </div>
            <div className={styles.statInfo}>
              <div className={styles.statValueRow}>
                <span className={styles.statValue}>{stats.total_announcements}</span>
              </div>
              <p className={styles.statLabel}>Total Announcements</p>
              <div>
                <span className={`${styles.statBadge} ${styles.badgeSuccess}`}>
                  ↑ +{stats.new_this_month} this month
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Students Reached */}
          <div className={styles.statCard}>
            <div className={styles.statIconWrap} style={{ background: '#f0fdf4', color: '#16a34a' }}>
              <Users size={20} />
            </div>
            <div className={styles.statInfo}>
              <div className={styles.statValueRow}>
                <span className={styles.statValue}>{stats.students_reached.toLocaleString()}</span>
              </div>
              <p className={styles.statLabel}>Students Reached</p>
              <div>
                <span className={`${styles.statBadge} ${styles.badgeSuccess}`}>
                  ↑ {stats.delivery_rate_pct}% delivery rate
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Total Views */}
          <div className={styles.statCard}>
            <div className={styles.statIconWrap} style={{ background: '#eff6ff', color: '#2563eb' }}>
              <Eye size={20} />
            </div>
            <div className={styles.statInfo}>
              <div className={styles.statValueRow}>
                <span className={styles.statValue}>{stats.total_views.toLocaleString()}</span>
              </div>
              <p className={styles.statLabel}>Total Views</p>
              <div>
                <span className={`${styles.statBadge} ${styles.badgeSuccess}`}>
                  ↑ {stats.open_rate_pct}% open rate
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Scheduled */}
          <div className={styles.statCard}>
            <div className={styles.statIconWrap} style={{ background: '#fffbeb', color: '#d97706' }}>
              <Clock size={20} />
            </div>
            <div className={styles.statInfo}>
              <div className={styles.statValueRow}>
                <span className={styles.statValue}>{stats.scheduled_count}</span>
              </div>
              <p className={styles.statLabel}>Scheduled</p>
              <div>
                <span className={`${styles.statBadge} ${styles.badgeWarning}`}>
                  ● Upcoming announcements
                </span>
              </div>
            </div>
          </div>

          {/* View Analytics Button */}
          <button className={styles.statActionBtn} onClick={() => setShowAnalyticsModal(true)}>
            <BarChart3 size={18} />
            <span>View Analytics</span>
          </button>
        </div>

        {/* ── Tab Navigation ── */}
        <div className={styles.tabNavRow}>
          <div className={styles.tabPills}>
            <button
              className={`${styles.tabBtn} ${activeTab === 'create' ? styles.tabBtnActive : ''}`}
              onClick={() => handleTabClick('create')}
            >
              <Send size={14} /> Create Announcement
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'scheduled' ? styles.tabBtnActive : ''}`}
              onClick={() => handleTabClick('scheduled')}
            >
              <Clock size={14} /> Scheduled ({stats.scheduled_count})
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'sent' ? styles.tabBtnActive : ''}`}
              onClick={() => handleTabClick('sent')}
            >
              <CheckCircle2 size={14} /> Sent ({stats.total_announcements})
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'drafts' ? styles.tabBtnActive : ''}`}
              onClick={() => handleTabClick('drafts')}
            >
              <FileText size={14} /> Drafts ({stats.drafts_count})
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'templates' ? styles.tabBtnActive : ''}`}
              onClick={() => handleTabClick('templates')}
            >
              <Sparkles size={14} /> Templates
            </button>
          </div>

          <button className={styles.settingsBtn} onClick={() => setShowSettingsModal(true)}>
            <Settings size={14} /> Announcement Settings
          </button>
        </div>

        {/* ── Main 2-Column Compose & Live Preview Grid (Shown in Create/Templates mode) ── */}
        {(activeTab === 'create' || activeTab === 'templates') && (
          <div className={styles.composeGrid}>
            {/* Left Column: Compose Announcement */}
            <div className={styles.composeCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderIcon}>
                  <Megaphone size={19} />
                </div>
                <div>
                  <h2 className={styles.cardHeaderTitle}>Compose Announcement</h2>
                  <p className={styles.cardHeaderSubtitle}>
                    Create and send announcements to keep your community informed.
                  </p>
                </div>
              </div>

              {/* Send To Selector (4 Cards) */}
              <div>
                <label className={styles.sectionLabel}>Send To</label>
                <div className={styles.targetGrid}>
                  <div
                    className={`${styles.targetCard} ${target === 'all' ? styles.targetCardActive : ''}`}
                    onClick={() => setTarget('all')}
                  >
                    <input type="radio" checked={target === 'all'} onChange={() => setTarget('all')} className={styles.targetRadio} />
                    <div>
                      <p className={styles.targetCardTitle}>
                        <Users size={13} color="#7c3aed" /> Everyone
                      </p>
                      <p className={styles.targetCardSub}>All students + instructors</p>
                    </div>
                  </div>

                  <div
                    className={`${styles.targetCard} ${target === 'students' ? styles.targetCardActive : ''}`}
                    onClick={() => setTarget('students')}
                  >
                    <input type="radio" checked={target === 'students'} onChange={() => setTarget('students')} className={styles.targetRadio} />
                    <div>
                      <p className={styles.targetCardTitle}>Students Only</p>
                      <p className={styles.targetCardSub}>Only students</p>
                    </div>
                  </div>

                  <div
                    className={`${styles.targetCard} ${target === 'instructors' ? styles.targetCardActive : ''}`}
                    onClick={() => setTarget('instructors')}
                  >
                    <input type="radio" checked={target === 'instructors'} onChange={() => setTarget('instructors')} className={styles.targetRadio} />
                    <div>
                      <p className={styles.targetCardTitle}>Instructors Only</p>
                      <p className={styles.targetCardSub}>Only instructors</p>
                    </div>
                  </div>

                  <div
                    className={`${styles.targetCard} ${target === 'custom' ? styles.targetCardActive : ''}`}
                    onClick={() => setTarget('custom')}
                  >
                    <input type="radio" checked={target === 'custom'} onChange={() => setTarget('custom')} className={styles.targetRadio} />
                    <div>
                      <p className={styles.targetCardTitle}>Custom</p>
                      <p className={styles.targetCardSub}>Select specific groups</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2x2 Scope Filter Dropdowns */}
              <div className={styles.scopeGrid}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>
                    Department <span className={styles.formLabelOptional}>(optional)</span>
                  </label>
                  <select
                    className={styles.selectInput}
                    value={selectedDept}
                    onChange={e => setSelectedDept(e.target.value)}
                  >
                    <option value="">All departments</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>
                    Academic Year <span className={styles.formLabelOptional}>(optional)</span>
                  </label>
                  <select
                    className={styles.selectInput}
                    value={selectedYear}
                    onChange={e => onYearChange(e.target.value)}
                  >
                    <option value="">All years</option>
                    {years.map(y => (
                      <option key={y.id} value={String(y.year_label).slice(0, 4)}>{y.year_label}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>
                    Batch <span className={styles.formLabelOptional}>(optional)</span>
                  </label>
                  <select
                    className={styles.selectInput}
                    value={selectedBatch}
                    disabled={!batches.length}
                    onChange={e => onBatchChange(e.target.value)}
                  >
                    <option value="">{batches.length ? 'All batches' : 'All batches'}</option>
                    {batches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>
                    Section <span className={styles.formLabelOptional}>(optional)</span>
                  </label>
                  <select
                    className={styles.selectInput}
                    value={selectedSection}
                    disabled={!sections.length}
                    onChange={e => setSelectedSection(e.target.value)}
                  >
                    <option value="">{sections.length ? 'All sections' : 'All sections'}</option>
                    {sections.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Priority & Category Tag Selector */}
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div>
                  <label className={styles.formLabel} style={{ marginBottom: 6, display: 'block' }}>Priority</label>
                  <div className={styles.chipsRow}>
                    {(['normal', 'important', 'urgent'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        className={`${styles.chipBtn} ${priority === p ? (p === 'urgent' ? styles.chipUrgent : p === 'important' ? styles.chipImportant : styles.chipBtnSelected) : ''}`}
                        onClick={() => setPriority(p)}
                      >
                        {p === 'urgent' ? '🔥 Urgent' : p === 'important' ? '! Important' : 'Normal'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={styles.formLabel} style={{ marginBottom: 6, display: 'block' }}>Category</label>
                  <div className={styles.chipsRow}>
                    {([
                      { id: 'general', label: 'General' },
                      { id: 'cancellation', label: 'Cancellation' },
                      { id: 'schedule', label: 'Schedule' },
                      { id: 'exam', label: 'Exam' },
                      { id: 'event', label: 'Event' },
                    ] as const).map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className={`${styles.chipBtn} ${category === c.id ? styles.chipBtnSelected : ''}`}
                        onClick={() => setCategory(c.id)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Title Input */}
              <div className={styles.formField}>
                <label className={styles.formLabel}>Title *</label>
                <input
                  type="text"
                  className={styles.textInput}
                  placeholder="e.g. Lab cancelled tomorrow"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                />
              </div>

              {/* Message Rich Textarea */}
              <div className={styles.formField}>
                <label className={styles.formLabel}>Message *</label>
                <div className={styles.richContainer}>
                  <div className={styles.richToolbar}>
                    <button type="button" className={styles.toolbarBtn} title="Bold"><Bold size={13} /></button>
                    <button type="button" className={styles.toolbarBtn} title="Italic"><Italic size={13} /></button>
                    <button type="button" className={styles.toolbarBtn} title="Underline"><Underline size={13} /></button>
                    <div style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 4px' }} />
                    <button type="button" className={styles.toolbarBtn} title="Bullet List"><List size={13} /></button>
                    <button type="button" className={styles.toolbarBtn} title="Numbered List"><ListOrdered size={13} /></button>
                    <button type="button" className={styles.toolbarBtn} title="Insert Link"><LinkIcon size={13} /></button>
                    <button type="button" className={styles.toolbarBtn} title="Insert Image"><ImageIcon size={13} /></button>
                    <button type="button" className={styles.toolbarBtn} title="Expand Editor" style={{ marginLeft: 'auto' }}><Maximize2 size={13} /></button>
                  </div>
                  <textarea
                    className={styles.richTextarea}
                    placeholder="Write your announcement here..."
                    value={message}
                    maxLength={2000}
                    onChange={e => setMessage(e.target.value)}
                    required
                  />
                  <div className={styles.charCounter}>{message.length}/2000</div>
                </div>
              </div>

              {/* Attach Files */}
              <div className={styles.attachBox}>
                <div className={styles.attachInfo}>
                  <div className={styles.attachIconWrap}>
                    <Paperclip size={18} />
                  </div>
                  <div>
                    <p className={styles.attachTextTitle}>Attach Files (optional)</p>
                    <p className={styles.attachTextSub}>Upload documents, images or other resources (Max 10 MB each)</p>
                  </div>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.zip"
                />

                {attachment ? (
                  <div className={styles.attachmentPill}>
                    <Paperclip size={13} />
                    <span>{attachment.name} ({attachment.size})</span>
                    <button
                      type="button"
                      className={styles.removeAttachmentBtn}
                      onClick={() => setAttachment(null)}
                      title="Remove attachment"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.uploadBtn}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload File
                  </button>
                )}
              </div>

              {/* Schedule for later Switch */}
              <div className={styles.scheduleRow}>
                <div className={styles.scheduleLabelWrap}>
                  <p className={styles.scheduleTitle}>Schedule for later</p>
                  <p className={styles.scheduleSub}>Choose date and time to send</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    type="checkbox"
                    checked={isScheduled}
                    onChange={e => setIsScheduled(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#7c3aed', cursor: 'pointer' }}
                  />
                  {isScheduled && (
                    <input
                      type="datetime-local"
                      className={styles.textInput}
                      style={{ width: 220, padding: '6px 10px', fontSize: 12.5 }}
                      value={sendAtLocal}
                      onChange={e => setSendAtLocal(e.target.value)}
                    />
                  )}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className={styles.formActionRow}>
                <button
                  type="button"
                  className={styles.draftBtn}
                  disabled={sending || !title.trim()}
                  onClick={() => handleSend(true)}
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  className={styles.sendBtn}
                  disabled={sending || !title.trim() || !message.trim()}
                  onClick={() => handleSend(false)}
                >
                  {sending ? (
                    <><Loader2 size={16} className="animate-spin" /> Processing...</>
                  ) : isScheduled ? (
                    <><Clock size={16} /> Schedule Announcement</>
                  ) : (
                    <><Send size={16} /> Send Announcement</>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Preview & Quick Templates */}
            <div className={styles.previewSidebar}>
              {/* Card 1: Live Preview */}
              <div className={styles.previewBox}>
                <div className={styles.previewHeader}>
                  <div className={styles.previewHeaderLeft}>
                    <div className={styles.previewEyeIcon}>
                      <Eye size={16} />
                    </div>
                    <div>
                      <h3 className={styles.previewTitle}>Preview</h3>
                      <p className={styles.previewSub}>How it will appear to recipients</p>
                    </div>
                  </div>

                  <div className={styles.roleToggle}>
                    <button
                      type="button"
                      className={`${styles.roleToggleBtn} ${previewRole === 'student' ? styles.roleToggleActive : ''}`}
                      onClick={() => setPreviewRole('student')}
                    >
                      Student View
                    </button>
                    <button
                      type="button"
                      className={`${styles.roleToggleBtn} ${previewRole === 'instructor' ? styles.roleToggleActive : ''}`}
                      onClick={() => setPreviewRole('instructor')}
                    >
                      Instructor View
                    </button>
                  </div>
                </div>

                {/* Actual Real Looking Card Preview */}
                <div className={styles.mockCard}>
                  <div className={styles.mockCardAuthorRow}>
                    <div className={styles.mockAvatar}>NL</div>
                    <div className={styles.mockAuthorMeta}>
                      <span>NexLab</span>
                      <span className={styles.mockTime}>• Just now</span>
                    </div>
                  </div>

                  {priority !== 'normal' && (
                    <div
                      className={styles.mockPriorityPill}
                      style={{
                        background: priority === 'urgent' ? '#fee2e2' : '#fef2f2',
                        color: priority === 'urgent' ? '#b91c1c' : '#dc2626',
                        border: priority === 'urgent' ? '1px solid #fca5a5' : '1px solid #fecaca',
                      }}
                    >
                      {priority === 'urgent' ? '🔥 Urgent' : '! Important'}
                    </div>
                  )}

                  <h4 className={styles.mockTitle}>
                    {title.trim() || 'Lab Cancelled Tomorrow'}
                  </h4>

                  <p className={styles.mockBody}>
                    {message.trim() || "Tomorrow's Data Structures lab (Section A) has been cancelled due to maintenance. The revised schedule will be shared soon. Apologies for the inconvenience."}
                  </p>

                  {attachment && (
                    <div className={styles.mockAttachment}>
                      <Paperclip size={14} color="#7c3aed" />
                      <span>{attachment.name}</span>
                      <span style={{ color: '#9ca3af', fontSize: 11 }}>({attachment.size})</span>
                    </div>
                  )}

                  <div className={styles.mockActionsRow}>
                    <button type="button" className={styles.mockActionBtn}>
                      <ThumbsUp size={13} /> Like
                    </button>
                    <button type="button" className={styles.mockActionBtn}>
                      <Check size={13} /> Mark as Read
                    </button>
                  </div>
                </div>
              </div>

              {/* Card 2: Quick Templates */}
              <div className={styles.templatesBox}>
                <div className={styles.templatesHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className={styles.templateIconWrap}>
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <h3 className={styles.previewTitle}>Quick Templates</h3>
                      <p className={styles.previewSub}>Use predefined templates for common announcements.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    onClick={() => applyTemplate('cancellation')}
                  >
                    View All
                  </button>
                </div>

                <div className={styles.templatesGrid}>
                  <button type="button" className={styles.templateCard} onClick={() => applyTemplate('cancellation')}>
                    <span style={{ color: '#ef4444', fontSize: 14 }}>✕</span>
                    <span>Lab Cancellation</span>
                  </button>
                  <button type="button" className={styles.templateCard} onClick={() => applyTemplate('schedule')}>
                    <Calendar size={14} color="#7c3aed" />
                    <span>Schedule Update</span>
                  </button>
                  <button type="button" className={styles.templateCard} onClick={() => applyTemplate('exam')}>
                    <FileText size={14} color="#2563eb" />
                    <span>Exam Notice</span>
                  </button>
                  <button type="button" className={styles.templateCard} onClick={() => applyTemplate('general')}>
                    <Megaphone size={14} color="#d97706" />
                    <span>General Notice</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Bottom Section: Recent Announcements Table ── */}
        <div className={styles.tableCard}>
          <div className={styles.tableHeaderRow}>
            <div className={styles.tableHeaderLeft}>
              <div className={styles.cardHeaderIcon} style={{ background: '#f5f0ff' }}>
                <FileText size={18} color="#7c3aed" />
              </div>
              <div>
                <h3 className={styles.cardHeaderTitle}>Recent Announcements</h3>
                <p className={styles.cardHeaderSubtitle}>View and manage previously sent announcements.</p>
              </div>
            </div>

            <div className={styles.tableHeaderControls}>
              <div className={styles.searchBox}>
                <Search size={15} color="#9ca3af" />
                <input
                  type="text"
                  placeholder="Search announcements..."
                  className={styles.searchInput}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className={styles.selectInput}
                style={{ width: 'auto', padding: '7px 12px', fontSize: 12.5 }}
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
              >
                <option value="all">All Status</option>
                <option value="sent">Sent</option>
                <option value="scheduled">Scheduled</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>

          <div className={styles.tableResponsive}>
            <table className={styles.announcementsTable}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Target Audience</th>
                  <th>Sent On</th>
                  <th>Reach</th>
                  <th>Views</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAnnouncements.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
                      {loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          <Loader2 size={18} className="animate-spin" /> Loading announcements...
                        </div>
                      ) : (
                        'No announcements found.'
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredAnnouncements.map(ann => {
                    const sentDate = ann.sent_at || ann.created_at;
                    const dateFormatted = sentDate
                      ? new Date(sentDate).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })
                      : '—';

                    return (
                      <tr key={ann.id} className={styles.tableRow}>
                        <td>
                          <div className={styles.rowTitle}>
                            {ann.priority === 'urgent' && <span style={{ color: '#dc2626' }}>🔥</span>}
                            {ann.title}
                          </div>
                          <p className={styles.rowSubtitle}>{ann.message}</p>
                        </td>

                        <td>
                          <span className={styles.audienceBadge}>
                            <Users size={12} color="#7c3aed" />
                            {ann.audience_label || (ann.target === 'all' ? 'Everyone' : ann.target)}
                          </span>
                        </td>

                        <td style={{ whiteSpace: 'nowrap', fontSize: 12.5, color: '#4b5563' }}>
                          {ann.status === 'scheduled' && ann.send_at
                            ? `Scheduled: ${new Date(ann.send_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                            : dateFormatted}
                        </td>

                        <td style={{ fontWeight: 700, color: '#111827' }}>
                          {ann.status === 'sent' ? ann.reach_count.toLocaleString() : '—'}
                        </td>

                        <td>
                          {ann.status === 'sent' ? (
                            <span style={{ fontWeight: 600, color: '#111827' }}>
                              {ann.views_count.toLocaleString()}{' '}
                              <span style={{ fontSize: 11.5, color: '#6b7280' }}>
                                ({ann.open_rate_pct || (ann.reach_count ? Math.round((ann.views_count / ann.reach_count) * 100) : 0)}%)
                              </span>
                            </span>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>—</span>
                          )}
                        </td>

                        <td>
                          <span className={`${styles.statusPill} ${
                            ann.status === 'sent'
                              ? styles.statusSent
                              : ann.status === 'scheduled'
                              ? styles.statusScheduled
                              : styles.statusDraft
                          }`}>
                            ● {ann.status.charAt(0).toUpperCase() + ann.status.slice(1)}
                          </span>
                        </td>

                        <td>
                          <button
                            type="button"
                            className={styles.actionIconBtn}
                            onClick={() => openDetails(ann)}
                            title="View Details & Analytics"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            type="button"
                            className={styles.actionIconBtn}
                            onClick={() => handleDelete(ann.id, ann.title)}
                            title="Delete Announcement"
                          >
                            <Trash2 size={14} color="#dc2626" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Modal: Announcement Details & Reader List ── */}
      {detailModalItem && (
        <div className={styles.modalBackdrop} onClick={() => setDetailModalItem(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={styles.statIconWrap} style={{ background: '#faf5ff', color: '#7c3aed', width: 36, height: 36 }}>
                  <Megaphone size={18} />
                </div>
                <div>
                  <h3 className={styles.modalTitle}>{detailModalItem.title}</h3>
                  <span className={styles.audienceBadge} style={{ marginTop: 4 }}>
                    <Users size={12} /> {detailModalItem.audience_label || detailModalItem.target}
                  </span>
                </div>
              </div>
              <button type="button" className={styles.closeModalBtn} onClick={() => setDetailModalItem(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Metrics Breakdown in Modal */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <div style={{ background: '#f9fafb', padding: '12px', borderRadius: 10, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>Reach</p>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>{detailModalItem.reach_count}</p>
              </div>
              <div style={{ background: '#f9fafb', padding: '12px', borderRadius: 10, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>Total Views</p>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#2563eb' }}>{detailModalItem.views_count}</p>
              </div>
              <div style={{ background: '#f9fafb', padding: '12px', borderRadius: 10, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>Open Rate</p>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#059669' }}>
                  {detailModalItem.open_rate_pct || (detailModalItem.reach_count ? Math.round((detailModalItem.views_count / detailModalItem.reach_count) * 100) : 0)}%
                </p>
              </div>
              <div style={{ background: '#f9fafb', padding: '12px', borderRadius: 10, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>Likes</p>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#d97706' }}>{detailModalItem.likes_count}</p>
              </div>
            </div>

            <div>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: '#374151', margin: '0 0 6px' }}>Announcement Body</p>
              <div style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, fontSize: 13.5, lineHeight: 1.5, color: '#1f2937' }}>
                {detailModalItem.message}
              </div>
            </div>

            {detailModalItem.attachment_name && (
              <div>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: '#374151', margin: '0 0 6px' }}>Attachment</p>
                <a
                  href={detailModalItem.attachment_url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.mockAttachment}
                  style={{ textDecoration: 'none' }}
                >
                  <Paperclip size={14} color="#7c3aed" />
                  <span>{detailModalItem.attachment_name}</span>
                  <span style={{ color: '#9ca3af', fontSize: 11 }}>({detailModalItem.attachment_size || 'File'})</span>
                </a>
              </div>
            )}

            {detailModalItem.readers && detailModalItem.readers.length > 0 && (
              <div>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: '#374151', margin: '0 0 8px' }}>
                  Recipient Interactions ({detailModalItem.readers.length})
                </p>
                <div className={styles.readersList}>
                  {detailModalItem.readers.map((r, i) => (
                    <div key={i} className={styles.readerItem}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={styles.readerName}>{r.user_name}</span>
                        <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'capitalize' }}>({r.user_role})</span>
                        {r.liked && <ThumbsUp size={12} color="#7c3aed" fill="#7c3aed" />}
                      </div>
                      <span className={styles.readerTime}>
                        {r.read_at ? `Read on ${new Date(r.read_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Unread'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: View Analytics Overview ── */}
      {showAnalyticsModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowAnalyticsModal(false)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BarChart3 size={20} color="#7c3aed" />
                <h3 className={styles.modalTitle}>Announcements Performance & Reach Analytics</h3>
              </div>
              <button type="button" className={styles.closeModalBtn} onClick={() => setShowAnalyticsModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                <div style={{ border: '1px solid #ede8f5', borderRadius: 12, padding: 16, background: '#faf8ff' }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Aggregate Delivery Rate</p>
                  <p style={{ margin: '4px 0', fontSize: 24, fontWeight: 700, color: '#7c3aed' }}>{stats.delivery_rate_pct}%</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: '#10b981' }}>High delivery reliability across all institutional batches</p>
                </div>
                <div style={{ border: '1px solid #ede8f5', borderRadius: 12, padding: 16, background: '#f0fdf4' }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Average Open Rate</p>
                  <p style={{ margin: '4px 0', fontSize: 24, fontWeight: 700, color: '#059669' }}>{stats.open_rate_pct}%</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: '#059669' }}>Top 5% engagement across virtual lab academic portals</p>
                </div>
              </div>

              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
                <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#111827' }}>Top Viewed Announcements</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {announcements.slice(0, 4).map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span style={{ fontWeight: 600, color: '#1f2937' }}>{a.title}</span>
                      <span style={{ fontWeight: 700, color: '#7c3aed' }}>{a.views_count.toLocaleString()} views ({a.open_rate_pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Announcement Settings ── */}
      {showSettingsModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowSettingsModal(false)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Settings size={20} color="#7c3aed" />
                <h3 className={styles.modalTitle}>Announcement Settings</h3>
              </div>
              <button type="button" className={styles.closeModalBtn} onClick={() => setShowSettingsModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <span>Send real-time WebSockets toast alerts</span>
                <input type="checkbox" defaultChecked style={{ accentColor: '#7c3aed', width: 18, height: 18 }} />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <span>Email digests for Urgent and Important notices</span>
                <input type="checkbox" defaultChecked style={{ accentColor: '#7c3aed', width: 18, height: 18 }} />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <span>Allow student like reactions</span>
                <input type="checkbox" defaultChecked style={{ accentColor: '#7c3aed', width: 18, height: 18 }} />
              </label>

              <button
                type="button"
                className={styles.sendBtn}
                style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                onClick={() => {
                  setShowSettingsModal(false);
                  showToast('Announcement settings saved.');
                }}
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </InstitutionShell>
  );
}
